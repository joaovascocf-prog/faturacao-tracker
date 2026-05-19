const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const CLIENT_ID = 'clvhslda';
const CLIENT_SECRET = '1afdfa6ff107c5fd7361224305bcc209b26bb54e';

app.post('/login', async (req, res) => {
  console.log('LOGIN REQUEST body:', JSON.stringify(req.body));
  const { username, password } = req.body || {};
  if (!username || !password) {
    console.log('Missing credentials!');
    return res.status(400).json({ error: 'Missing credentials', received: req.body });
  }
  try {
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: username,
      password: password
    });
    console.log('Sending to Moloni:', params.toString().replace(password, '***'));
    const r = await fetch('https://api.moloni.pt/v1/grant/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await r.json();
    console.log('Moloni response:', JSON.stringify(data));
    res.json(data);
  } catch(e) {
    console.log('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api', async (req, res) => {
  const { endpoint, method, body } = req.body || {};
  if (!endpoint || !endpoint.startsWith('https://api.moloni.pt/v1/')) {
    return res.status(400).json({ error: 'Invalid endpoint' });
  }
  try {
    const opts = { method: method || 'GET', headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.body = body;
    }
    const r = await fetch(endpoint, opts);
    res.json(await r.json());
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', version: '2' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server v2 running on port ' + PORT));
