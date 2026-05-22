// api/index.js - Vercel Serverless Function
// This replaces the Node.js server and runs on Vercel's infrastructure

import express from 'express';
import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import cors from 'cors';
import axios from 'axios';
import { config } from 'dotenv';

config();

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ── In-Memory Database (Vercel doesn't have persistent disk storage) ──────────
// For production, use Vercel + PostgreSQL/MongoDB instead
const users = new Map();
const sessions = new Map();
const positions = new Map();
const trades = new Map();

// ── Encryption Helpers ────────────────────────────────────────────────────────
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

function encryptCreds(creds) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(creds), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptCreds(encryptedData) {
  try {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const [iv, encrypted] = encryptedData.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (e) {
    console.error('Decryption failed:', e);
    return null;
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── Angel One API Helpers ─────────────────────────────────────────────────────
async function genTOTP(secret) {
  try {
    const b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const s = secret.replace(/\s/g, "").toUpperCase();
    let bits = "";
    for (const c of s) {
      const i = b32.indexOf(c);
      if (i >= 0) bits += i.toString(2).padStart(5, "0");
    }
    const bytes = Buffer.alloc(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++)
      bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    const ctr = Math.floor(Date.now() / 1000 / 30);
    const cb = Buffer.alloc(8);
    let c = ctr;
    for (let i = 7; i >= 0; i--) {
      cb[i] = c & 0xff;
      c >>= 8;
    }
    const hmac = crypto.createHmac('sha1', bytes);
    const sig = new Uint8Array(hmac.update(cb).digest());
    const off = sig[sig.length - 1] & 0x0f;
    const code =
      (((sig[off] & 0x7f) << 24) |
        (sig[off + 1] << 16) |
        (sig[off + 2] << 8) |
        sig[off + 3]) %
      1000000;
    return code.toString().padStart(6, "0");
  } catch (e) {
    console.error('TOTP gen failed:', e);
    return "000000";
  }
}

async function angelLogin(apiKey, clientId, mpin, totpSecret) {
  try {
    const totp = await genTOTP(totpSecret);
    const response = await axios.post(
      'https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword',
      { clientcode: clientId, password: mpin, totp },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-PrivateKey': apiKey,
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACAddress': '00:00:00:00:00:00',
        },
        timeout: 10000,
      }
    );
    if (response.data.status && response.data.data?.jwtToken) {
      return { ok: true, token: response.data.data.jwtToken };
    }
    return { ok: false, error: response.data.message || 'Auth failed' };
  } catch (e) {
    return { ok: false, error: 'Angel One API error: ' + e.message };
  }
}

async function fetchAngelQuotes(jwt, apiKey, symbols) {
  const prices = {};
  try {
    const batch = symbols.slice(0, 10);
    const angelTokens = {
      'RELIANCE.NS': { ex: 'NSE', tok: '2885' },
      'TCS.NS': { ex: 'NSE', tok: '11536' },
      'INFY.NS': { ex: 'NSE', tok: '1594' },
      'HDFCBANK.NS': { ex: 'NSE', tok: '1333' },
      'ICICIBANK.NS': { ex: 'NSE', tok: '4963' },
      'SBIN.NS': { ex: 'NSE', tok: '3045' },
      'WIPRO.NS': { ex: 'NSE', tok: '10718' },
      'MARUTI.NS': { ex: 'NSE', tok: '9075' },
      'SUNPHARMA.NS': { ex: 'NSE', tok: '10652' },
      'HINDUNILVR.NS': { ex: 'NSE', tok: '2519' },
    };
    const groups = {};
    batch.forEach(s => {
      const t = angelTokens[s];
      if (!t) return;
      if (!groups[t.ex]) groups[t.ex] = [];
      groups[t.ex].push(t.tok);
    });
    for (const [ex, toks] of Object.entries(groups)) {
      try {
        const response = await axios.post(
          'https://apiconnect.angelbroking.com/rest/secure/angelbroking/market/v1/quote/',
          { mode: 'LTP', exchangeTokens: { [ex]: toks } },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${jwt}`,
              'X-PrivateKey': apiKey,
              'X-UserType': 'USER',
              'X-SourceID': 'WEB',
            },
            timeout: 10000,
          }
        );
        (response.data?.data?.fetched || []).forEach(item => {
          const s = batch.find(x => angelTokens[x]?.tok === item.symbolToken);
          if (s && item.ltp) prices[s] = parseFloat(item.ltp);
        });
      } catch (e) {
        console.log('Fetch for', ex, 'failed:', e.message);
      }
    }
  } catch (e) {
    console.error('Quote batch error:', e);
  }
  return prices;
}

// ── Auth Routes ───────────────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { username, password, apiKey, clientId, mpin, totpSecret } = req.body;
  if (!username || !password || !apiKey || !clientId || !mpin || !totpSecret) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (users.has(username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  const passwordHash = hashPassword(password);
  const encryptedCreds = encryptCreds({ apiKey, clientId, mpin, totpSecret });
  users.set(username, {
    id: username,
    passwordHash,
    encryptedCreds,
  });
  res.json({ ok: true, message: 'Account created. Login now.' });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = users.get(username);
  if (!user || hashPassword(password) !== user.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const creds = decryptCreds(user.encryptedCreds);
  const authResult = await angelLogin(creds.apiKey, creds.clientId, creds.mpin, creds.totpSecret);
  if (!authResult.ok) {
    return res.status(401).json({ error: 'Angel One auth failed: ' + authResult.error });
  }
  const token = genToken();
  sessions.set(token, {
    userId: username,
    angelToken: authResult.token,
    apiKey: creds.apiKey,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  res.json({
    ok: true,
    token,
    userId: username,
    message: 'Logged in successfully',
  });
});

// ── Middleware: Verify Token ──────────────────────────────────────────────────
function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  const session = sessions.get(token);
  if (!session || new Date(session.expiresAt) < new Date()) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.userId = session.userId;
  req.angelToken = session.angelToken;
  req.apiKey = session.apiKey;
  next();
}

// ── Trading Routes ────────────────────────────────────────────────────────────
app.get('/api/portfolio', verifyToken, (req, res) => {
  const userPositions = Array.from(positions.values()).filter(p => p.userId === req.userId && p.status === 'open');
  const userTrades = Array.from(trades.values()).filter(t => t.userId === req.userId);
  const totalPnL = userTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  res.json({
    positions: userPositions,
    totalPnL,
    balance: 1000,
  });
});

app.post('/api/buy', verifyToken, (req, res) => {
  const { symbol, qty, price } = req.body;
  if (!symbol || !qty || !price) return res.status(400).json({ error: 'Missing fields' });
  const posId = genToken();
  const tp = +(price * 1.025).toFixed(2);
  const sl = +(price * 0.985).toFixed(2);
  positions.set(posId, {
    id: posId,
    userId: req.userId,
    symbol,
    qty,
    entryPrice: price,
    entryTime: new Date(),
    tpPrice: tp,
    slPrice: sl,
    status: 'open',
  });
  const tradeId = genToken();
  trades.set(tradeId, {
    id: tradeId,
    userId: req.userId,
    symbol,
    side: 'BUY',
    price,
    qty,
    executedAt: new Date(),
    reason: 'AI_SIGNAL',
  });
  res.json({ ok: true, message: `Bought ${qty} ${symbol} @ ₹${price}`, posId });
});

app.post('/api/sell', verifyToken, (req, res) => {
  const { positionId, price } = req.body;
  if (!positionId || !price) return res.status(400).json({ error: 'Missing fields' });
  const pos = positions.get(positionId);
  if (!pos || pos.userId !== req.userId) return res.status(404).json({ error: 'Position not found' });
  const pnl = +((price - pos.entryPrice) * pos.qty).toFixed(2);
  pos.status = 'closed';
  const tradeId = genToken();
  trades.set(tradeId, {
    id: tradeId,
    userId: req.userId,
    symbol: pos.symbol,
    side: 'SELL',
    price,
    qty: pos.qty,
    pnl,
    executedAt: new Date(),
    reason: 'MANUAL',
  });
  res.json({ ok: true, pnl, message: `Sold ${pos.qty} ${pos.symbol} | P&L: ₹${pnl}` });
});

app.get('/api/quotes', verifyToken, async (req, res) => {
  const symbols = req.query.symbols?.split(',') || [];
  const quotes = await fetchAngelQuotes(req.angelToken, req.apiKey, symbols);
  res.json(quotes);
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Nexus Trading Backend on Vercel', timestamp: new Date() });
});

export default app;
