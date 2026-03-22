const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabase');
const router = express.Router();

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado: solo administradores' });
  }
  next();
}

router.use(requireAdmin);

// GET /api/v1/admin/usuarios
router.get('/usuarios', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, username, nombre_completo, email, role, activo, created_at')
      .order('nombre_completo');
    if (error) throw error;
    res.json({ usuarios: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/admin/usuarios
router.post('/usuarios', async (req, res) => {
  try {
    const { nombre_completo, username, email, role, password } = req.body;
    if (!nombre_completo || !username || !password)
      return res.status(400).json({ error: 'Nombre, username y password son requeridos' });
    if (!['admin','doctor','recepcionista'].includes(role))
      return res.status(400).json({ error: 'Rol invalido' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password debe tener al menos 6 caracteres' });
    const { data: existe } = await supabase
      .from('usuarios').select('id').eq('username', username).single();
    if (existe) return res.status(409).json({ error: 'El username ya existe' });
    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('usuarios')
      .insert({ nombre_completo, username, email: email||null, role, password_hash, activo: true })
      .select('id, username, nombre_completo, email, role, activo, created_at')
      .single();
    if (error) throw error;
    res.status(201).json({ usuario: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/v1/admin/usuarios/:id
router.patch('/usuarios/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre_completo, email, role, activo } = req.body;
    const updates = {};
    if (nombre_completo !== undefined) updates.nombre_completo = nombre_completo;
    if (email !== undefined) updates.email = email || null;
    if (role !== undefined) {
      if (!['admin','doctor','recepcionista'].includes(role))
        return res.status(400).json({ error: 'Rol invalido' });
      updates.role = role;
    }
    if (activo !== undefined) updates.activo = activo;
    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: 'Nada que actualizar' });
    const { data, error } = await supabase
      .from('usuarios')
      .update(updates)
      .eq('id', id)
      .select('id, username, nombre_completo, email, role, activo')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ usuario: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/v1/admin/usuarios/:id — desactivar
router.delete('/usuarios/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.user.id)
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta' });
    const { data, error } = await supabase
      .from('usuarios')
      .update({ activo: false })
      .eq('id', id)
      .select('id, username, activo')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario desactivado', usuario: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/v1/admin/usuarios/:id/activar — activar
router.patch('/usuarios/:id/activar', async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('usuarios')
      .update({ activo: true })
      .eq('id', id)
      .select('id, username, activo')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Usuario activado', usuario: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/v1/admin/usuarios/:id/reset-password
router.post('/usuarios/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;
    const { nueva_password } = req.body;
    if (!nueva_password || nueva_password.length < 6)
      return res.status(400).json({ error: 'Password debe tener al menos 6 caracteres' });
    const password_hash = await bcrypt.hash(nueva_password, 10);
    const { data, error } = await supabase
      .from('usuarios')
      .update({ password_hash })
      .eq('id', id)
      .select('id, username')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ message: 'Password reseteada exitosamente', usuario: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/v1/admin/pacientes
router.get('/pacientes', async (req, res) => {
  try {
    const { search } = req.query;
    let query = supabase
      .from('pacientes')
      .select('id, nombre, rut, telefono, email, prevision, estado, doctor_id, doctor:usuarios!pacientes_doctor_id_fkey(nombre_completo)')
      .order('nombre');
    if (search) query = query.or(`nombre.ilike.%${search}%,rut.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    const pacientes = data.map(p => ({
      id: p.id, nombre: p.nombre, rut: p.rut,
      telefono: p.telefono, email: p.email,
      prevision: p.prevision, estado: p.estado,
      doctor_id: p.doctor_id,
      doctor_nombre: p.doctor ? p.doctor.nombre_completo : null
    }));
    res.json({ pacientes });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/v1/admin/pacientes/:id/reasignar
router.patch('/pacientes/:id/reasignar', async (req, res) => {
  try {
    const { id } = req.params;
    const { doctor_id } = req.body;
    if (!doctor_id) return res.status(400).json({ error: 'doctor_id es requerido' });
    const { data: doctor } = await supabase
      .from('usuarios').select('id, role, activo').eq('id', doctor_id).single();
    if (!doctor) return res.status(404).json({ error: 'Doctor no encontrado' });
    if (!doctor.activo) return res.status(400).json({ error: 'El doctor esta inactivo' });
    if (!['doctor','admin'].includes(doctor.role))
      return res.status(400).json({ error: 'El usuario no es doctor ni admin' });
    const { data, error } = await supabase
      .from('pacientes')
      .update({ doctor_id })
      .eq('id', id)
      .select('id, nombre, doctor_id')
      .single();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Paciente no encontrado' });
    res.json({ message: 'Doctor reasignado exitosamente', paciente: data });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/v1/admin/actividad
router.get('/actividad', async (req, res) => {
  try {
    const { count: totalPacientes } = await supabase
      .from('pacientes').select('*', { count: 'exact', head: true }).eq('estado', 'activo');
    const { count: totalUsuarios } = await supabase
      .from('usuarios').select('*', { count: 'exact', head: true }).eq('activo', true);
    let derivacionesPendientes = 0;
    try {
      const { count } = await supabase
        .from('derivaciones').select('*', { count: 'exact', head: true }).eq('estado', 'pendiente');
      derivacionesPendientes = count || 0;
    } catch (e) {}

    const primerDiaMes = new Date();
    primerDiaMes.setDate(1);
    primerDiaMes.setHours(0, 0, 0, 0);

    const { data: doctores } = await supabase
      .from('usuarios').select('id, nombre_completo')
      .in('role', ['doctor','admin']).eq('activo', true).order('nombre_completo');

    const actividadDoctores = [];
    for (const doctor of doctores || []) {
      const { count: pacientes } = await supabase
        .from('pacientes').select('*', { count: 'exact', head: true }).eq('doctor_id', doctor.id);
      const { count: evolucionesMes } = await supabase
        .from('evoluciones').select('*', { count: 'exact', head: true })
        .eq('paciente_id', doctor.id).gte('fecha_hora', primerDiaMes.toISOString());
      let derivEnviadas = 0, derivRecibidas = 0;
      try {
        const { count: e } = await supabase.from('derivaciones')
          .select('*', { count: 'exact', head: true })
          .eq('doctor_origen_id', doctor.id).gte('created_at', primerDiaMes.toISOString());
        derivEnviadas = e || 0;
        const { count: r } = await supabase.from('derivaciones')
          .select('*', { count: 'exact', head: true })
          .eq('doctor_destino_id', doctor.id).gte('created_at', primerDiaMes.toISOString());
        derivRecibidas = r || 0;
      } catch (e) {}
      actividadDoctores.push({
        doctor_id: doctor.id, doctor_nombre: doctor.nombre_completo,
        total_pacientes: pacientes || 0, evoluciones_mes: evolucionesMes || 0,
        derivaciones_enviadas: derivEnviadas, derivaciones_recibidas: derivRecibidas
      });
    }

    res.json({
      total_pacientes: totalPacientes || 0,
      total_usuarios: totalUsuarios || 0,
      derivaciones_pendientes: derivacionesPendientes,
      actividad_doctores: actividadDoctores
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;