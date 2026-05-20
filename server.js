const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const CLIENT_ID = 'clvhslda';
const CLIENT_SECRET = '1afdfa6ff107c5fd7361224305bcc209b26bb54e';
const REDIRECT_URI = 'https://faturacao-tracker.onrender.com/moloni-callback';

let moloniTokens = { access_token: null, refresh_token: null, expires_at: 0 };

// Serve HTML
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Start Moloni OAuth
app.get('/moloni-auth', (req, res) => {
  const url = 'https://api.moloni.pt/v1/authorize' +
    '?response_type=code&client_id=' + CLIENT_ID +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
  res.redirect(url);
});

// Handle Moloni callback
app.get('/moloni-callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('<h2>Erro: sem código</h2>');
  try {
    const body = 'grant_type=authorization_code&client_id=' + CLIENT_ID +
      '&client_secret=' + CLIENT_SECRET + '&code=' + code +
      '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
    const r = await fetch('https://api.moloni.pt/v1/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await r.json();
    console.log('Moloni callback:', JSON.stringify(data));
    if (data.access_token) {
      moloniTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000
      };
      res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ Moloni conectado!</h2><p>Podes fechar esta janela.</p><script>window.close()</script></body></html>');
    } else {
      res.send('<h2>❌ Erro: ' + JSON.stringify(data) + '</h2>');
    }
  } catch(e) {
    res.send('<h2>Erro: ' + e.message + '</h2>');
  }
});

async function getToken() {
  if (moloniTokens.access_token && Date.now() < moloniTokens.expires_at) return moloniTokens.access_token;
  if (!moloniTokens.refresh_token) throw new Error('not_authenticated');
  const body = 'grant_type=refresh_token&client_id=' + CLIENT_ID +
    '&client_secret=' + CLIENT_SECRET + '&refresh_token=' + moloniTokens.refresh_token;
  const r = await fetch('https://api.moloni.pt/v1/grant', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('refresh_failed');
  moloniTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || moloniTokens.refresh_token,
    expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000
  };
  return moloniTokens.access_token;
}

app.get('/moloni-status', async (req, res) => {
  try { await getToken(); res.json({ connected: true }); }
  catch { res.json({ connected: false }); }
});

app.get('/moloni-companies', async (req, res) => {
  try {
    const tok = await getToken();
    const r = await fetch('https://api.moloni.pt/v1/companies/getAll/?access_token=' + tok);
    res.json(await r.json());
  } catch(e) { res.status(401).json({ error: e.message }); }
});

app.get('/moloni-invoices', async (req, res) => {
  try {
    const tok = await getToken();
    const cid = req.query.company_id;
    const r = await fetch('https://api.moloni.pt/v1/invoices/getAll/?access_token=' + tok + '&company_id=' + cid + '&qty=500&offset=0');
    res.json(await r.json());
  } catch(e) { res.status(401).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server v6 running on port ' + PORT));
