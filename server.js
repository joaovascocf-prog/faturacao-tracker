const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const CLIENT_ID = 'clvhslda';
const CLIENT_SECRET = '1afdfa6ff107c5fd7361224305bcc209b26bb54e';
const REDIRECT_URI = 'https://faturacao-tracker.onrender.com/moloni-callback';

// Store tokens in memory (persists while server runs)
let moloniTokens = {
  access_token: null,
  refresh_token: null,
  expires_at: 0
};

// Serve the HTML app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Step 1: Start Moloni OAuth flow
app.get('/moloni-auth', (req, res) => {
  const url = 'https://api.moloni.pt/v1/authorize' +
    '?response_type=code' +
    '&client_id=' + CLIENT_ID +
    '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
  res.redirect(url);
});

// Step 2: Handle callback from Moloni
app.get('/moloni-callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send('<h2>Erro: sem código de autorização</h2>');
  try {
    const body = 'grant_type=authorization_code' +
      '&client_id=' + CLIENT_ID +
      '&client_secret=' + CLIENT_SECRET +
      '&code=' + code +
      '&redirect_uri=' + encodeURIComponent(REDIRECT_URI);
    const r = await fetch('https://api.moloni.pt/v1/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await r.json();
    console.log('Moloni auth callback:', JSON.stringify(data));
    if (data.access_token) {
      moloniTokens.access_token = data.access_token;
      moloniTokens.refresh_token = data.refresh_token;
      moloniTokens.expires_at = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
      res.send('<h2>✅ Moloni conectado com sucesso!</h2><p>Podes fechar esta janela e voltar à app.</p><script>setTimeout(()=>window.close(),2000)</script>');
    } else {
      res.send('<h2>❌ Erro: ' + JSON.stringify(data) + '</h2>');
    }
  } catch(e) {
    res.send('<h2>Erro: ' + e.message + '</h2>');
  }
});

// Get valid token (refreshes automatically)
async function getToken() {
  if (moloniTokens.access_token && Date.now() < moloniTokens.expires_at) {
    return moloniTokens.access_token;
  }
  if (moloniTokens.refresh_token) {
    const body = 'grant_type=refresh_token' +
      '&client_id=' + CLIENT_ID +
      '&client_secret=' + CLIENT_SECRET +
      '&refresh_token=' + moloniTokens.refresh_token;
    const r = await fetch('https://api.moloni.pt/v1/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    const data = await r.json();
    if (data.access_token) {
      moloniTokens.access_token = data.access_token;
      moloniTokens.refresh_token = data.refresh_token || moloniTokens.refresh_token;
      moloniTokens.expires_at = Date.now() + ((data.expires_in || 3600) - 60) * 1000;
      return moloniTokens.access_token;
    }
  }
  throw new Error('not_authenticated');
}

// Check if Moloni is connected
app.get('/moloni-status', async (req, res) => {
  try {
    await getToken();
    res.json({ connected: true });
  } catch {
    res.json({ connected: false });
  }
});

// Get invoices
app.get('/moloni-invoices', async (req, res) => {
  try {
    const token = await getToken();
    const { company_id, month, year } = req.query;
    const url = 'https://api.moloni.pt/v1/invoices/getAll/?access_token=' + token +
      '&company_id=' + company_id + '&qty=500&offset=0';
    const r = await fetch(url);
    res.json(await r.json());
  } catch(e) {
    res.status(401).json({ error: e.message });
  }
});

// Get companies
app.get('/moloni-companies', async (req, res) => {
  try {
    const token = await getToken();
    const r = await fetch('https://api.moloni.pt/v1/companies/getAll/?access_token=' + token);
    res.json(await r.json());
  } catch(e) {
    res.status(401).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server v5 running on port ' + PORT));
