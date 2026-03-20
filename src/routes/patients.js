// src/routes/patients.js
// JARVIS OS — Modulo Clinica: Fichas Odontologicas
// MIGRADO A SUPABASE — datos persisten entre reinicios

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// ---------------------------------------------------------------------------
// VALIDACION
// ---------------------------------------------------------------------------
const VALID_ESTADOS = ['activo', 'inactivo', 'pendiente'];

function validatePatient(data, requireAll = true) {
  const errors = [];

  if (requireAll || data.nombre !== undefined) {
    if (!data.nombre || typeof data.nombre !== 'string' || data.nombre.trim().length < 2) {
      errors.push('nombre: requerido, minimo 2 caracteres');
    }
  }

  if (requireAll || data.rut !== undefined) {
    if (!data.rut || typeof data.rut !== 'string') {
      errors.push('rut: requerido');
    } else if (!/^\d{7,8}-[\dkK]$/.test(data.rut.trim())) {
      errors.push('rut: formato invalido (ej: 12345678-9)');
    }
  }

  if (data.telefono !== undefined && data.telefono !== null) {
    if (typeof data.telefono !== 'string' || !/^\+?[\d\s\-]{7,15}$/.test(data.telefono)) {
      errors.push('telefono: formato invalido');
    }
  }

  if (data.email !== undefined && data.email !== null) {
    if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('email: formato invalido');
    }
  }

  if (data.estado !== undefined) {
    if (!VALID_ESTADOS.includes(data.estado)) {
      errors.push(`estado: debe ser uno de [${VALID_ESTADOS.join(', ')}]`);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// GET /api/v1/pacientes
// Filtros: ?estado=activo &search=juan
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('pacientes')
      .select('*')
      .order('created_at', { ascending: false });

    if (req.query.estado) {
      if (!VALID_ESTADOS.includes(req.query.estado)) {
        return res.status(400).json({ error: `estado invalido. Valores: ${VALID_ESTADOS.join(', ')}` });
      }
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
    console.error('GET /pacientes error:', error);
    res.status(500).json({ error: 'Error al obtener pacientes', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/pacientes/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data, error } = await supabase
      .from('pacientes')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Paciente ${id} no encontrado` });
      }
      throw error;
    }

    res.json(data);

  } catch (error) {
    console.error('GET /pacientes/:id error:', error);
    res.status(500).json({ error: 'Error al obtener paciente', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/pacientes
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const errors = validatePatient(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
    }

    // Verificar RUT duplicado
    const { data: existe } = await supabase
      .from('pacientes')
      .select('id, nombre')
      .eq('rut', req.body.rut.trim())
      .single();

    if (existe) {
      return res.status(409).json({
        error: 'Ya existe un paciente con este RUT',
        paciente_id: existe.id,
        nombre: existe.nombre
      });
    }

    const { data, error } = await supabase
      .from('pacientes')
      .insert({
        nombre: req.body.nombre.trim(),
        rut: req.body.rut.trim(),
        telefono: req.body.telefono?.trim() || null,
        email: req.body.email?.trim().toLowerCase() || null,
        fecha_nacimiento: req.body.fecha_nacimiento || null,
        direccion: req.body.direccion?.trim() || null,
        prevision: req.body.prevision?.trim() || null,
        alergias: req.body.alergias || [],
        notas_medicas: req.body.notas_medicas?.trim() || null,
        estado: 'activo'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Paciente registrado exitosamente',
      paciente: data
    });

  } catch (error) {
    console.error('POST /pacientes error:', error);
    res.status(500).json({ error: 'Error al crear paciente', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/pacientes/:id
// Actualizacion parcial
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const errors = validatePatient(req.body, false);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
    }

    const { id: _id, created_at, ...updates } = req.body;

    const { data, error } = await supabase
      .from('pacientes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Paciente ${id} no encontrado` });
      }
      throw error;
    }

    res.json({ message: 'Paciente actualizado', paciente: data });

  } catch (error) {
    console.error('PATCH /pacientes/:id error:', error);
    res.status(500).json({ error: 'Error al actualizar paciente', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/pacientes/:id
// Soft delete — cambia estado a inactivo
// En odontologia NUNCA se borran fichas clinicas
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data: paciente } = await supabase
      .from('pacientes')
      .select('estado')
      .eq('id', id)
      .single();

    if (!paciente) {
      return res.status(404).json({ error: `Paciente ${id} no encontrado` });
    }

    if (paciente.estado === 'inactivo') {
      return res.status(409).json({ error: 'El paciente ya esta inactivo' });
    }

    const { data, error } = await supabase
      .from('pacientes')
      .update({ estado: 'inactivo', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      message: 'Paciente marcado como inactivo (registro preservado)',
      paciente: data
    });

  } catch (error) {
    console.error('DELETE /pacientes/:id error:', error);
    res.status(500).json({ error: 'Error al desactivar paciente', details: error.message });
  }
});

module.exports = router;