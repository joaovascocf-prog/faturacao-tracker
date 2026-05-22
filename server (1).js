const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const CLIENT_ID     = 'clvhslda';
const CLIENT_SECRET = '1afdfa6ff107c5fd7361224305bcc209b26bb54e';
const REDIRECT_URI  = 'https://faturacao-tracker.onrender.com/moloni-callback';

// In-memory backup (perde-se em restart — cliente é a fonte de verdade)
let moloniMemory = { access_token: null, refresh_token: null, expires_at: 0, company_id: null };

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ── Moloni OAuth ────────────────────────────────────────────────────────────
app.get('/moloni-auth', (req, res) => {
  const url = 'https://api.moloni.pt/v1/authorize'
    + '?response_type=code&client_id=' + CLIENT_ID
    + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
  res.redirect(url);
});

app.get('/moloni-callback', async (req, res) => {
  console.log('Moloni callback params:', JSON.stringify(req.query));
  const code = req.query.code;
  if (!code) return res.send('<h2>Sem código: ' + JSON.stringify(req.query) + '</h2>');
  try {
    const grantUrl = 'https://api.moloni.pt/v1/grant/'
      + '?grant_type=authorization_code'
      + '&client_id=' + CLIENT_ID
      + '&redirect_uri=' + encodeURIComponent(REDIRECT_URI)
      + '&client_secret=' + CLIENT_SECRET
      + '&code=' + code;
    const r = await fetch(grantUrl);
    const text = await r.text();
    console.log('Grant response:', text.substring(0, 300));
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (data.access_token) {
      moloniMemory = {
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    Date.now() + ((data.expires_in || 3600) - 60) * 1000,
        company_id:    req.query.company_id || null
      };
      console.log('Moloni OK, company_id:', moloniMemory.company_id);

      // Enviar tokens ao cliente via postMessage — assim persistem em localStorage
      const payload = JSON.stringify({
        type:          'moloni_auth',
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_at:    moloniMemory.expires_at,
        company_id:    moloniMemory.company_id
      });
      res.send(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0f172a;color:#f1f5f9">
        <h2>✅ Moloni conectado!</h2><p style="color:#64748b">A fechar…</p>
        <script>
          try { window.opener && window.opener.postMessage(${payload}, '*'); } catch(e){}
          setTimeout(function(){ window.close(); }, 800);
        </script>
      </body></html>`);
    } else {
      res.send('<h2 style="color:red">❌ Moloni: ' + JSON.stringify(data) + '</h2>');
    }
  } catch(e) { res.send('<h2>Erro: ' + e.message + '</h2>'); }
});

// Escolhe token: header do cliente > memória do servidor
async function resolveToken(req) {
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ') && auth.length > 10) return auth.slice(7);
  // fallback: memória servidor (pode estar vazia após restart)
  if (moloniMemory.access_token && Date.now() < moloniMemory.expires_at) return moloniMemory.access_token;
  if (!moloniMemory.refresh_token) throw new Error('not_authenticated');
  return await serverRefresh();
}

async function serverRefresh() {
  const url = 'https://api.moloni.pt/v1/grant/'
    + '?grant_type=refresh_token'
    + '&client_id=' + CLIENT_ID
    + '&client_secret=' + CLIENT_SECRET
    + '&refresh_token=' + moloniMemory.refresh_token;
  const r = await fetch(url);
  const data = await r.json();
  if (!data.access_token) throw new Error('refresh_failed: ' + JSON.stringify(data));
  moloniMemory = { ...moloniMemory, access_token: data.access_token, refresh_token: data.refresh_token || moloniMemory.refresh_token, expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000 };
  return moloniMemory.access_token;
}

app.get('/moloni-status', async (req, res) => {
  try { await resolveToken(req); res.json({ connected: true, company_id: moloniMemory.company_id }); }
  catch { res.json({ connected: false }); }
});

// Refresh via cliente (CORS-safe)
app.post('/moloni-refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'Falta refresh_token' });
  try {
    const url = 'https://api.moloni.pt/v1/grant/'
      + '?grant_type=refresh_token'
      + '&client_id=' + CLIENT_ID
      + '&client_secret=' + CLIENT_SECRET
      + '&refresh_token=' + encodeURIComponent(refresh_token);
    const r = await fetch(url);
    const data = await r.json();
    if (!data.access_token) return res.status(401).json({ error: 'refresh_failed', detail: data });
    res.json({
      access_token:  data.access_token,
      refresh_token: data.refresh_token || refresh_token,
      expires_at:    Date.now() + ((data.expires_in || 3600) - 60) * 1000
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/moloni-companies', async (req, res) => {
  try {
    const tok = await resolveToken(req);
    if (moloniMemory.company_id) return res.json([{ company_id: moloniMemory.company_id }]);
    const r = await fetch('https://api.moloni.pt/v1/companies/getAll/?access_token=' + tok);
    res.json(await r.json());
  } catch(e) { res.status(401).json({ error: e.message }); }
});

app.get('/moloni-invoices', async (req, res) => {
  try {
    const tok = await resolveToken(req);
    const cid = req.query.company_id;
    const r = await fetch('https://api.moloni.pt/v1/invoices/getAll/?access_token=' + tok + '&company_id=' + cid + '&qty=500&offset=0');
    res.json(await r.json());
  } catch(e) { res.status(401).json({ error: e.message }); }
});

// ── Debug: ver campos reais das faturas Moloni ──────────────────────────────
app.get('/moloni-debug', async (req, res) => {
  try {
    const tok = await resolveToken(req);
    const cid = req.query.company_id;
    if (!cid) return res.status(400).json({ error: 'Falta company_id' });
    const r = await fetch('https://api.moloni.pt/v1/invoices/getAll/?access_token=' + tok + '&company_id=' + cid + '&qty=5&offset=0');
    const data = await r.json();
    // Devolve as primeiras 5 faturas com todos os campos visíveis
    res.json({ total: Array.isArray(data) ? data.length : 'n/a', sample: data });
  } catch(e) { res.status(401).json({ error: e.message }); }
});

// ── Gmail ────────────────────────────────────────────────────────────────────
app.post('/send-email', async (req, res) => {
  const { to, subject, html, text: plainText } = req.body || {};
  if (!to || !subject) return res.status(400).json({ error: 'Faltam campos obrigatórios: to, subject' });

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return res.status(503).json({ error: 'Gmail não configurado. Adiciona GMAIL_USER e GMAIL_APP_PASSWORD nas Environment Variables do Render.' });
  }
  try {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
    await transporter.sendMail({
      from: `Faturação Tracker <${user}>`,
      to, subject,
      ...(html     ? { html }       : {}),
      ...(plainText ? { text: plainText } : {})
    });
    res.json({ ok: true });
  } catch(e) {
    console.error('Gmail error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server v13 running on port ' + PORT));
