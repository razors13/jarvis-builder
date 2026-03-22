const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabase');
const router = express.Router();

const SECRET = process.env.JWT_SECRET || 'jarvis-secret-key';

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Usuario y password requeridos' });

  try {
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('id, username, password_hash, nombre_completo, email, role, activo')
      .eq('username', username)
      .single();

    if (error || !user)
      return res.status(401).json({ error: 'Credenciales invalidas' });

    if (!user.activo)
      return res.status(401).json({ error: 'Usuario inactivo — contacta al administrador' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Credenciales invalidas' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, nombre: user.nombre_completo },
      SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, username: user.username, nombre: user.nombre_completo, role: user.role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/verify', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ valid: false });
  try {
    const user = jwt.verify(token, SECRET);
    res.json({ valid: true, id: user.id, username: user.username, role: user.role, nombre: user.nombre });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// PATCH /api/v1/auth/perfil — actualizar nombre, email, password
router.patch('/perfil', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  let userId;
  try {
    const decoded = jwt.verify(token, SECRET);
    userId = decoded.id;
  } catch {
    return res.status(401).json({ error: 'Token invalido' });
  }

  const { nombre_completo, email, password_actual, password_nueva } = req.body;
  const updates = {};

  if (nombre_completo) updates.nombre_completo = nombre_completo;
  if (email) updates.email = email;

  if (password_nueva) {
    if (!password_actual)
      return res.status(400).json({ error: 'Debes ingresar tu password actual' });

    const { data: user } = await supabase
      .from('usuarios')
      .select('password_hash')
      .eq('id', userId)
      .single();

    const valid = await bcrypt.compare(password_actual, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Password actual incorrecta' });

    updates.password_hash = await bcrypt.hash(password_nueva, 10);
  }

  if (Object.keys(updates).length === 0)
    return res.status(400).json({ error: 'Nada que actualizar' });

  const { data, error } = await supabase
    .from('usuarios')
    .update(updates)
    .eq('id', userId)
    .select('id, username, nombre_completo, email, role')
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Perfil actualizado', usuario: data });
});

// GET /api/v1/auth/doctores — lista doctores y admins activos
router.get('/doctores', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    
    const jwt = require('jsonwebtoken');
    const SECRET = process.env.JWT_SECRET || 'jarvis-secret-key';
    let currentUser;
    try { currentUser = jwt.verify(token, SECRET); }
    catch { return res.status(401).json({ error: 'Token invalido' }); }
    
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, nombre_completo, role')
      .in('role', ['doctor', 'admin'])
      .eq('activo', true)
      .neq('id', currentUser.id)
      .order('nombre_completo');
    
    if (error) throw error;
    res.json({ doctores: data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;