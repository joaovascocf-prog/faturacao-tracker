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

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/moloni-auth', (req, res) => {
  const url = 'https://api.moloni.pt/v1/authorize' +
    '?response_type=code&client_id=' + CLIENT_ID +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
  res.redirect(url);
});

app.get('/moloni-callback', async (req, res) => {
  console.log('Callback params:', JSON.stringify(req.query));
  const code = req.query.code;
  if (!code) {
    return res.send('<h2>Params: ' + JSON.stringify(req.query) + '</h2>');
  }
  try {
    // Moloni uses GET with params in URL (as per official docs)
    const grantUrl = 'https://api.moloni.pt/v1/grant/' +
      '?grant_type=authorization_code' +
      '&client_id=' + CLIENT_ID +
      '&redirect_uri=' + encodeURIComponent(REDIRECT_URI) +
      '&client_secret=' + CLIENT_SECRET +
      '&code=' + code;
    console.log('Calling Moloni grant URL:', grantUrl.substring(0, 120) + '...');
    const r = await fetch(grantUrl, { method: 'GET' });
    const text = await r.text();
    console.log('Grant response raw:', text.substring(0, 300));
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (data.access_token) {
      moloniTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + ((data.expires_in || 3600) - 60) * 1000
      };
      res.send('<html><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>✅ Moloni conectado!</h2><p>Podes fechar esta janela.</p><script>window.close()</script></body></html>');
    } else {
      res.send('<h2>❌ Resposta Moloni: ' + JSON.stringify(data) + '</h2><p>Code usado: ' + code.substring(0,10) + '...</p>');
    }
  } catch(e) {
    res.send('<h2>Erro: ' + e.message + '</h2>');
  }
});

async function getToken() {
  if (moloniTokens.access_token && Date.now() < moloniTokens.expires_at) return moloniTokens.access_token;
  if (!moloniTokens.refresh_token) throw new Error('not_authenticated');
  const refreshUrl = 'https://api.moloni.pt/v1/grant/' +
    '?grant_type=refresh_token' +
    '&client_id=' + CLIENT_ID +
    '&client_secret=' + CLIENT_SECRET +
    '&refresh_token=' + moloniTokens.refresh_token;
  const r = await fetch(refreshUrl, { method: 'GET' });
  const data = await r.json();
  if (!data.access_token) throw new Error('refresh_failed: ' + JSON.stringify(data));
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
app.listen(PORT, () => console.log('Server v10 running on port ' + PORT));
