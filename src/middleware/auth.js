const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'jarvis-secret-key';

module.exports = function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '') ;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
};