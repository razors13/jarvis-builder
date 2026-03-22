const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();

const SECRET = process.env.JWT_SECRET || 'jarvis-secret-key';

const USERS = [
  {
    id: 1,
    username: process.env.ADMIN_USER || 'kevin',
    passwordHash: process.env.ADMIN_HASH
  }
];

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuario y password requeridos' });

  const user = USERS.find(u => u.username === username);
  if (!user)
    return res.status(401).json({ error: 'Credenciales invalidas' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid)
    return res.status(401).json({ error: 'Credenciales invalidas' });

  const token = jwt.sign(
    { id: user.id, username: user.username },
    SECRET,
    { expiresIn: '8h' }
  );

  res.json({ token, username: user.username });
});

// GET /api/v1/auth/verify
router.get('/verify', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ valid: false });
  try {
    const user = jwt.verify(token, SECRET);
    res.json({ valid: true, username: user.username });
  } catch {
    res.status(401).json({ valid: false });
  }
});

module.exports = router;