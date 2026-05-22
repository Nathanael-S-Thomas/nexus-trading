import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = 'https://nexus-trading-ten.vercel.app/api';

export default function NexusTrading() {
  // Auth
  const [page, setPage] = useState('landing'); // landing | register | login | dashboard
  const [form, setForm] = useState({
    // For register: username, password, apiKey, clientId, mpin, totpSecret
    // For login: username, password
    username: '',
    password: '',
    apiKey: '',
    clientId: '',
    mpin: '',
    totpSecret: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('nexus_token'));

  // Dashboard
  const [portfolio, setPortfolio] = useState({ positions: [], totalPnL: 0, balance: 0 });
  const [quotes, setQuotes] = useState({});
  const [trades, setTrades] = useState([]);
  const [log, setLog] = useState([]);

  const addLog = useCallback((msg, type = 'info') => {
    setLog(p => [{ msg, type, t: new Date().toLocaleTimeString() }, ...p].slice(0, 50));
  }, []);

  // ── Auth Handlers ──────────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      addLog('✅ Account created! Now login.', 'buy');
      setForm(f => ({ ...f, apiKey: '', clientId: '', mpin: '', totpSecret: '' }));
      setPage('login');
    } catch (e) {
      setError(e.message);
      addLog(`❌ ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.username, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      localStorage.setItem('nexus_token', data.token);
      setToken(data.token);
      setPage('dashboard');
      addLog('✅ Logged in successfully!', 'buy');
    } catch (e) {
      setError(e.message);
      addLog(`❌ ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('nexus_token');
    setToken(null);
    setPage('landing');
    setForm(f => ({ ...f, username: '', password: '' }));
    addLog('Logged out', 'info');
  };

  // ── Dashboard Data Fetch ───────────────────────────────────────────────────
  useEffect(() => {
    if (page !== 'dashboard' || !token) return;
    const fetchPortfolio = async () => {
      try {
        const res = await fetch(`${API_BASE}/portfolio`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setPortfolio(data);
      } catch (e) {
        addLog(`⚠ Failed to fetch portfolio: ${e.message}`, 'warn');
      }
    };
    fetchPortfolio();
    const id = setInterval(fetchPortfolio, 5000);
    return () => clearInterval(id);
  }, [page, token, addLog]);

  // ── Fetch Quotes ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (page !== 'dashboard' || !token) return;
    const fetchQuotes_ = async () => {
      try {
        const symbols = ['RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'ICICIBANK.NS', 'SBIN.NS'];
        const res = await fetch(`${API_BASE}/quotes?symbols=${symbols.join(',')}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch quotes');
        const data = await res.json();
        setQuotes(data);
      } catch (e) {
        console.log('Quote fetch failed:', e.message);
      }
    };
    fetchQuotes_();
    const id = setInterval(fetchQuotes_, 8000);
    return () => clearInterval(id);
  }, [page, token]);

  // ── Styles ────────────────────────────────────────────────────────────────
  const G = {
    bg: '#080c14',
    bg2: '#0d1420',
    bg3: '#090d16',
    border: '#1a2535',
    text: '#c8d8e8',
    dim: '#5a7488',
    dimmer: '#3a5068',
    green: '#00d4aa',
    red: '#ff4d6d',
    yellow: '#ffaa00',
  };

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #080c14; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: #1a2535; border-radius: 2px; }
  `;

  const inp = {
    width: '100%',
    background: G.bg3,
    border: `1px solid ${G.border}`,
    borderRadius: 4,
    padding: '10px 12px',
    color: G.text,
    fontSize: 12,
    fontFamily: 'inherit',
    outline: 'none',
    marginBottom: 10,
  };

  // ── LANDING PAGE ───────────────────────────────────────────────────────────
  if (page === 'landing') {
    return (
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", background: G.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{CSS}</style>
        <div style={{ textAlign: 'center', maxWidth: 600 }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: G.green, marginBottom: 20, letterSpacing: '0.1em' }}>⚡ NEXUS TRADING</div>
          <div style={{ fontSize: 14, color: G.dim, marginBottom: 40, lineHeight: 1.8 }}>
            AI-Powered Multi-Stock Auto Trading<br/>
            Real-time NSE/BSE Analysis<br/>
            Secure Credential Storage · Cross-Platform Sync<br/>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button onClick={() => setPage('login')} style={{ padding: '12px 32px', background: G.green, color: G.bg, border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              LOGIN
            </button>
            <button onClick={() => setPage('register')} style={{ padding: '12px 32px', background: 'transparent', color: G.green, border: `2px solid ${G.green}`, borderRadius: 4, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              CREATE ACCOUNT
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── REGISTER PAGE ──────────────────────────────────────────────────────────
  if (page === 'register') {
    return (
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", background: G.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <style>{CSS}</style>
        <div style={{ background: G.bg2, border: `1px solid ${G.border}`, borderRadius: 8, padding: 40, width: '100%', maxWidth: 420 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: G.green, marginBottom: 10, letterSpacing: '0.1em' }}>CREATE ACCOUNT</h2>
          <p style={{ fontSize: 11, color: G.dimmer, marginBottom: 24 }}>Setup your Angel One credentials once. We encrypt and store them securely.</p>

          <form onSubmit={handleRegister}>
            <label style={{ display: 'block', fontSize: 10, color: G.dimmer, marginBottom: 4 }}>USERNAME</label>
            <input type="text" placeholder="Choose a username" value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} style={inp} required />

            <label style={{ display: 'block', fontSize: 10, color: G.dimmer, marginBottom: 4 }}>PASSWORD</label>
            <input type="password" placeholder="Strong password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} style={inp} required />

            <label style={{ display: 'block', fontSize: 10, color: G.dimmer, marginBottom: 4 }}>ANGEL ONE API KEY</label>
            <input type="text" placeholder="From SmartAPI dashboard" value={form.apiKey} onChange={(e) => setForm(f => ({ ...f, apiKey: e.target.value }))} style={inp} required />

            <label style={{ display: 'block', fontSize: 10, color: G.dimmer, marginBottom: 4 }}>CLIENT ID</label>
            <input type="text" placeholder="Your Angel One client ID" value={form.clientId} onChange={(e) => setForm(f => ({ ...f, clientId: e.target.value }))} style={inp} required />

            <label style={{ display: 'block', fontSize: 10, color: G.dimmer, marginBottom: 4 }}>MPIN</label>
            <input type="password" placeholder="4-6 digit MPIN" value={form.mpin} onChange={(e) => setForm(f => ({ ...f, mpin: e.target.value }))} style={inp} required />

            <label style={{ display: 'block', fontSize: 10, color: G.dimmer, marginBottom: 4 }}>TOTP SECRET</label>
            <input type="text" placeholder="Base32 secret from QR code" value={form.totpSecret} onChange={(e) => setForm(f => ({ ...f, totpSecret: e.target.value }))} style={inp} required />

            {error && <div style={{ fontSize: 11, color: G.red, padding: 10, background: `${G.red}18`, borderRadius: 4, marginBottom: 14 }}>⚠ {error}</div>}

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px 0', background: G.green, color: G.bg, border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              {loading ? 'REGISTERING…' : 'CREATE ACCOUNT'}
            </button>
          </form>

          <button onClick={() => setPage('login')} style={{ width: '100%', marginTop: 12, padding: '10px 0', background: 'transparent', color: G.green, border: `1px solid ${G.green}`, borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            Already have an account? Login
          </button>
        </div>
      </div>
    );
  }

  // ── LOGIN PAGE ─────────────────────────────────────────────────────────────
  if (page === 'login') {
    return (
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", background: G.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <style>{CSS}</style>
        <div style={{ background: G.bg2, border: `1px solid ${G.border}`, borderRadius: 8, padding: 40, width: '100%', maxWidth: 380 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: G.green, marginBottom: 10, letterSpacing: '0.1em' }}>LOGIN</h2>
          <p style={{ fontSize: 11, color: G.dimmer, marginBottom: 24 }}>No Angel One credentials needed here — they're already encrypted on our servers.</p>

          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', fontSize: 10, color: G.dimmer, marginBottom: 4 }}>USERNAME</label>
            <input type="text" placeholder="Your username" value={form.username} onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))} style={inp} required />

            <label style={{ display: 'block', fontSize: 10, color: G.dimmer, marginBottom: 4 }}>PASSWORD</label>
            <input type="password" placeholder="Your password" value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} style={inp} required />

            {error && <div style={{ fontSize: 11, color: G.red, padding: 10, background: `${G.red}18`, borderRadius: 4, marginBottom: 14 }}>⚠ {error}</div>}

            <button type="submit" disabled={loading} style={{ width: '100%', padding: '12px 0', background: G.green, color: G.bg, border: 'none', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              {loading ? 'LOGGING IN…' : 'LOGIN'}
            </button>
          </form>

          <button onClick={() => setPage('register')} style={{ width: '100%', marginTop: 12, padding: '10px 0', background: 'transparent', color: G.green, border: `1px solid ${G.green}`, borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            Create new account
          </button>
        </div>
      </div>
    );
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'IBM Plex Mono',monospace", background: G.bg, color: G.text, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ height: 50, borderBottom: `1px solid ${G.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: `${G.bg}e6`, position: 'sticky', top: 0, zIndex: 99 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: G.green, letterSpacing: '0.1em' }}>⚡ NEXUS DASHBOARD</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 11 }}>
          <span>BALANCE: <span style={{ fontWeight: 700, color: G.green }}>₹{portfolio.balance}</span></span>
          <span>P&L: <span style={{ fontWeight: 700, color: portfolio.totalPnL >= 0 ? G.green : G.red }}>₹{portfolio.totalPnL}</span></span>
          <span>POSITIONS: {portfolio.positions.length}</span>
          <button onClick={handleLogout} style={{ padding: '5px 12px', background: 'transparent', color: G.red, border: `1px solid ${G.red}`, borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            LOGOUT
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 12, padding: 12, overflow: 'hidden' }}>

        {/* Quotes */}
        <div style={{ flex: 1, background: G.bg2, border: `1px solid ${G.border}`, borderRadius: 8, padding: 16, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 12, color: G.green }}>📊 LIVE PRICES</div>
          {Object.entries(quotes).map(([sym, price]) => (
            <div key={sym} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${G.border}`, fontSize: 11 }}>
              <span>{sym}</span>
              <span style={{ fontWeight: 700 }}>₹{price?.toFixed(2) || '—'}</span>
            </div>
          ))}
        </div>

        {/* Positions */}
        <div style={{ flex: 1, background: G.bg2, border: `1px solid ${G.border}`, borderRadius: 8, padding: 16, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 12, color: G.green }}>📈 POSITIONS ({portfolio.positions.length})</div>
          {portfolio.positions.length === 0 ? (
            <div style={{ fontSize: 10, color: G.dimmer }}>No open positions. AI is scanning the market for opportunities.</div>
          ) : (
            portfolio.positions.map(pos => (
              <div key={pos.id} style={{ padding: '8px 0', borderBottom: `1px solid ${G.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
                  <span style={{ fontWeight: 700 }}>{pos.symbol}</span>
                  <span style={{ color: pos.entryPrice > 0 ? G.green : G.red }}>₹{pos.entryPrice}</span>
                </div>
                <div style={{ fontSize: 9, color: G.dimmer }}>Qty: {pos.qty} | TP: ₹{pos.tpPrice} | SL: ₹{pos.slPrice}</div>
              </div>
            ))
          )}
        </div>

        {/* Log */}
        <div style={{ flex: 0.8, background: G.bg2, border: `1px solid ${G.border}`, borderRadius: 8, padding: 16, overflowY: 'auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 12, color: G.green }}>📋 LOG</div>
          {log.map((e, i) => (
            <div key={i} style={{ fontSize: 9, padding: '2px 0', borderBottom: `1px solid ${G.border}`, color: e.type === 'buy' ? G.green : e.type === 'error' ? G.red : G.dim }}>
              <span style={{ color: G.dimmer }}>[{e.t}]</span> {e.msg}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
