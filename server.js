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
    console.log('Sending to Moloni:', params.toString().replace
