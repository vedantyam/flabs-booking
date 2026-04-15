const express = require('express');
const jwt = require('jsonwebtoken');

const router = express.Router();

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const validUsername = process.env.ADMIN_USERNAME || 'admin';
  const validPassword = process.env.ADMIN_PASSWORD || 'flabs2024';

  if (username !== validUsername || password !== validPassword) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign(
    { username, role: 'admin' },
    process.env.JWT_SECRET || 'flasbsecret123',
    { expiresIn: '24h' }
  );

  res.json({ token, username });
});

module.exports = router;
