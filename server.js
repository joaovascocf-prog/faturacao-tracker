const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = 'clvhslda';
const CLIENT_SECRET = '1afdfa6ff107c5fd7361224305bcc209b26bb54e';

// Login endpoint
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const params = new URLSearchParams({ grant_type: 'password', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, username, password });
    const r = await fetch('https://api.moloni.pt/v1/grant/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Refresh token
app.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'Missing token' });
  try {
    const params = new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token });
    const r = await fetch('https://api.moloni.pt/v1/grant/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// General proxy
app.post('/api', async (req, res) => {
  const { endpoint, method, body } = req.body;
  if (!endpoint || !endpoint.startsWith('https://api.moloni.pt/v1/')) return res.status(400).json({ error: 'Invalid endpoint' });
  try {
    const opts = { method: method || 'GET', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'; opts.body = body; }
    const r = await fetch(endpoint, opts);
    const data = await r.json();
    res.json(data);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
