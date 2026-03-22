const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

const VALID_ESTADOS = ['activo', 'inactivo', 'pendiente'];

function validatePatient(data, requireAll = true) {
  const errors = [];
  if (requireAll || data.nombre !== undefined) {
    if (!data.nombre || typeof data.nombre !== 'string' || data.nombre.trim().length < 2)
      errors.push('nombre: requerido, minimo 2 caracteres');
  }
  if (requireAll || data.rut !== undefined) {
    if (!data.rut || typeof data.rut !== 'string')
      errors.push('rut: requerido');
    else if (!/^\d{7,8}-[\dkK]$/.test(data.rut.trim().replace(/\s/g, '')))
      errors.push('rut: formato invalido (ej: 12345678-9)');
  }
  if (data.telefono !== undefined && data.telefono !== null) {
    if (typeof data.telefono !== 'string' || !/^\+?[\d\s\-]{7,15}$/.test(data.telefono))
      errors.push('telefono: formato invalido');
  }
  if (data.email !== undefined && data.email !== null) {
    if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      errors.push('email: formato invalido');
  }
  if (data.estado !== undefined) {
    if (!VALID_ESTADOS.includes(data.estado))
      errors.push(`estado: debe ser uno de [${VALID_ESTADOS.join(', ')}]`);
  }
  return errors;
}

// GET /api/v1/pacientes
router.get('/', async (req, res) => {
  try {
    const user = req.user;
    let query = supabase
      .from('pacientes')
      .select('*')
      .order('created_at', { ascending: false });

    if (user.role === 'doctor') {
      const { data: derivs } = await supabase
        .from('derivaciones')
        .select('paciente_id')
        .eq('doctor_destino_id', user.id)
        .in('estado', ['aceptada', 'completada']);

      const derivPacientes = (derivs || []).map(d => d.paciente_id);

      if (derivPacientes.length > 0) {
        query = query.or(`doctor_id.eq.${user.id},id.in.(${derivPacientes.join(',')})`);
      } else {
        query = query.eq('doctor_id', user.id);
      }
    }

    if (req.query.estado) {
      if (!VALID_ESTADOS.includes(req.query.estado))
        return res.status(400).json({ error: 'estado invalido' });
      query = query.eq('estado', req.query.estado);
    }

    if (req.query.search) {
      const term = req.query.search.trim();
      query = query.or(`nombre.ilike.%${term}%,rut.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ total: data.length, pacientes: data });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener pacientes', details: error.message });
  }
});

// GET /api/v1/pacientes/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data, error } = await supabase
      .from('pacientes').select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116')
        return res.status(404).json({ error: `Paciente ${id} no encontrado` });
      throw error;
    }

    if (req.user.role === 'admin') return res.json(data);
    if (req.user.role === 'recepcionista') return res.json(data);
    if (data.doctor_id === req.user.id) return res.json(data);

    const { data: deriv } = await supabase
      .from('derivaciones')
      .select('id, acceso_historia')
      .eq('paciente_id', id)
      .eq('doctor_destino_id', req.user.id)
      .in('estado', ['aceptada', 'completada'])
      .limit(1)
      .single();

    if (deriv && deriv.acceso_historia) {
      return res.json({ ...data });
    }

    return res.status(403).json({ error: 'No tienes acceso a este paciente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener paciente', details: error.message });
  }
});

// POST /api/v1/pacientes
router.post('/', async (req, res) => {
  try {
    const errors = validatePatient(req.body, true);
    if (errors.length > 0)
      return res.status(400).json({ error: 'Datos invalidos', detalles: errors });

    const rutLimpio = req.body.rut.trim().replace(/\s/g, '');

    const { data: existe } = await supabase
      .from('pacientes')
      .select('id, nombre')
      .eq('rut', rutLimpio)
      .single();

    if (existe)
      return res.status(409).json({
        error: 'Ya existe un paciente con este RUT',
        paciente_id: existe.id,
        nombre: existe.nombre
      });

    const doctor_id = req.user.role === 'doctor' ? req.user.id :
                      req.body.doctor_id || null;

    const { data, error } = await supabase
      .from('pacientes')
      .insert({
        nombre: req.body.nombre.trim(),
        rut: rutLimpio,
        telefono: req.body.telefono?.trim() || null,
        email: req.body.email?.trim().toLowerCase() || null,
        fecha_nacimiento: req.body.fecha_nacimiento || null,
        direccion: req.body.direccion?.trim() || null,
        prevision: req.body.prevision?.trim() || null,
        alergias: req.body.alergias || [],
        notas_medicas: req.body.notas_medicas?.trim() || null,
        motivo_consulta: req.body.motivo_consulta?.trim() || null,
        doctor_id: doctor_id,
        estado: 'activo'
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ message: 'Paciente registrado exitosamente', paciente: data, id: data.id });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear paciente', details: error.message });
  }
});

// PATCH /api/v1/pacientes/:id
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const errors = validatePatient(req.body, false);
    if (errors.length > 0)
      return res.status(400).json({ error: 'Datos invalidos', detalles: errors });

    const { data: paciente } = await supabase
      .from('pacientes').select('doctor_id').eq('id', id).single();

    if (req.user.role === 'doctor' && paciente?.doctor_id && paciente.doctor_id !== req.user.id)
      return res.status(403).json({ error: 'No tienes acceso a este paciente' });

    const { id: _id, created_at, ...updates } = req.body;
    const { data, error } = await supabase
      .from('pacientes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Paciente actualizado', paciente: data });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar paciente', details: error.message });
  }
});

// DELETE /api/v1/pacientes/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    if (req.user.role !== 'admin')
      return res.status(403).json({ error: 'Solo el administrador puede desactivar pacientes' });

    const { data: paciente } = await supabase
      .from('pacientes').select('estado').eq('id', id).single();

    if (!paciente) return res.status(404).json({ error: `Paciente ${id} no encontrado` });
    if (paciente.estado === 'inactivo')
      return res.status(409).json({ error: 'El paciente ya esta inactivo' });

    const { data, error } = await supabase
      .from('pacientes')
      .update({ estado: 'inactivo', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: 'Paciente marcado como inactivo', paciente: data });
  } catch (error) {
    res.status(500).json({ error: 'Error al desactivar paciente', details: error.message });
  }
});

// GET /api/v1/pacientes/:id/odontograma
router.get('/:id/odontograma', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data, error } = await supabase
      .from('pacientes')
      .select('id, nombre, odontograma, doctor_id')
      .eq('id', id)
      .single();

    if (error) return res.status(404).json({ error: 'Paciente no encontrado' });

    if (req.user.role === 'recepcionista')
      return res.status(403).json({ error: 'No tienes acceso al odontograma' });

    if (req.user.role === 'admin')
      return res.json({ id: data.id, nombre: data.nombre, odontograma: data.odontograma || {} });

    if (data.doctor_id === req.user.id)
      return res.json({ id: data.id, nombre: data.nombre, odontograma: data.odontograma || {} });

    const { data: deriv } = await supabase
      .from('derivaciones')
      .select('id')
      .eq('paciente_id', id)
      .eq('doctor_destino_id', req.user.id)
      .in('estado', ['aceptada', 'completada'])
      .limit(1)
      .single();

    if (deriv)
      return res.json({ id: data.id, nombre: data.nombre, odontograma: data.odontograma || {} });

    return res.status(403).json({ error: 'No tienes acceso a este paciente' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/v1/pacientes/:id/odontograma
router.put('/:id/odontograma', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    if (req.user.role === 'recepcionista')
      return res.status(403).json({ error: 'No tienes acceso al odontograma' });

    const { data, error } = await supabase
      .from('pacientes')
      .update({ odontograma: req.body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, nombre, odontograma')
      .single();

    if (error) throw error;
    res.json({ message: 'Odontograma guardado', paciente: data.nombre, odontograma: data.odontograma });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
