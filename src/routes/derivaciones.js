const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// GET /api/v1/derivaciones — lista según rol
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    let query = supabase
      .from('derivaciones')
      .select(`
        *,
        paciente:pacientes(id, nombre, rut),
        origen:usuarios!derivaciones_doctor_origen_id_fkey(id, nombre_completo),
        destino:usuarios!derivaciones_doctor_destino_id_fkey(id, nombre_completo)
      `)
      .order('created_at', { ascending: false });

    if (user.role === 'doctor') {
      // Doctor ve las que envió o recibió
      query = query.or(`doctor_origen_id.eq.${user.id},doctor_destino_id.eq.${user.id}`);
    }

    if (req.query.estado) query = query.eq('estado', req.query.estado);
    if (req.query.paciente_id) query = query.eq('paciente_id', req.query.paciente_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ total: data.length, derivaciones: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/derivaciones/pendientes — solo las pendientes para el doctor logueado
router.get('/pendientes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('derivaciones')
      .select(`
        *,
        paciente:pacientes(id, nombre, rut),
        origen:usuarios!derivaciones_doctor_origen_id_fkey(id, nombre_completo)
      `)
      .eq('doctor_destino_id', req.user.id)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ total: data.length, derivaciones: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/derivaciones — crear derivacion
router.post('/', async (req, res) => {
  try {
    const { paciente_id, doctor_destino_id, motivo, notas, acceso_historia } = req.body;

    if (!paciente_id || !doctor_destino_id || !motivo)
      return res.status(400).json({ error: 'paciente_id, doctor_destino_id y motivo son requeridos' });

    if (doctor_destino_id === req.user.id)
      return res.status(400).json({ error: 'No puedes derivarte un paciente a ti mismo' });

    // Verificar que el paciente existe
    const { data: paciente } = await supabase
      .from('pacientes').select('id, nombre').eq('id', paciente_id).single();

    if (!paciente)
      return res.status(404).json({ error: 'Paciente no encontrado' });

    // Verificar que el doctor destino existe
    const { data: destino } = await supabase
      .from('usuarios').select('id, nombre_completo, role').eq('id', doctor_destino_id).single();

    if (!destino || destino.role === 'recepcionista')
      return res.status(400).json({ error: 'Doctor destino invalido' });

    const { data, error } = await supabase
      .from('derivaciones')
      .insert({
        paciente_id: parseInt(paciente_id),
        doctor_origen_id: req.user.id,
        doctor_destino_id: parseInt(doctor_destino_id),
        motivo: motivo.trim(),
        notas: notas?.trim() || null,
        acceso_historia: acceso_historia !== false,
        estado: 'pendiente'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({
      message: `Derivacion enviada a ${destino.nombre_completo}`,
      derivacion: data
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/v1/derivaciones/:id — aceptar, rechazar, completar
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data: deriv } = await supabase
      .from('derivaciones').select('*').eq('id', id).single();

    if (!deriv) return res.status(404).json({ error: 'Derivacion no encontrada' });

    const { estado, notas_retorno } = req.body;
    const updates = {};

    if (estado === 'aceptada' || estado === 'rechazada') {
      // Solo el doctor destino puede aceptar/rechazar
      if (deriv.doctor_destino_id !== req.user.id)
        return res.status(403).json({ error: 'Solo el doctor destino puede aceptar o rechazar' });
      updates.estado = estado;
    }

    if (estado === 'completada') {
      // Solo el doctor destino puede completar
      if (deriv.doctor_destino_id !== req.user.id)
        return res.status(403).json({ error: 'Solo el doctor destino puede completar la derivacion' });
      updates.estado = 'completada';
      updates.fecha_completado = new Date().toISOString();
      if (notas_retorno) updates.notas_retorno = notas_retorno.trim();
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ error: 'Nada que actualizar' });

    const { data, error } = await supabase
      .from('derivaciones')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        paciente:pacientes(id, nombre),
        origen:usuarios!derivaciones_doctor_origen_id_fkey(id, nombre_completo),
        destino:usuarios!derivaciones_doctor_destino_id_fkey(id, nombre_completo)
      `)
      .single();

    if (error) throw error;
    res.json({ message: `Derivacion ${estado}`, derivacion: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;