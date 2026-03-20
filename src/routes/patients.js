// src/routes/patients.js
// JARVIS OS — Módulo Clínica Odontológica
// ⚠️ FASE 1: Storage en memoria. Semana 2 → migrar a Supabase.
// Todos los datos se pierden al reiniciar el servidor.

const express = require('express');
const router = express.Router();

// ---------------------------------------------------------------------------
// IN-MEMORY STORE
// Funciona como posición en un trade: es temporal hasta que tengas
// una DB real. No pongas datos reales de pacientes aquí todavía.
// ---------------------------------------------------------------------------
let patients = [];
let nextId = 1;

// ---------------------------------------------------------------------------
// VALIDACIÓN
// ---------------------------------------------------------------------------
const VALID_ESTADOS = ['activo', 'inactivo', 'pendiente'];

function validatePatient(data, requireAll = true) {
  const errors = [];

  if (requireAll || data.nombre !== undefined) {
    if (!data.nombre || typeof data.nombre !== 'string' || data.nombre.trim().length < 2) {
      errors.push('nombre: requerido, mínimo 2 caracteres');
    }
  }

  if (requireAll || data.rut !== undefined) {
    if (!data.rut || typeof data.rut !== 'string') {
      errors.push('rut: requerido');
    } else if (!/^\d{7,8}-[\dkK]$/.test(data.rut.trim())) {
      errors.push('rut: formato inválido (ej: 12345678-9)');
    }
  }

  if (data.telefono !== undefined && data.telefono !== null) {
    if (typeof data.telefono !== 'string' || !/^\+?[\d\s\-]{7,15}$/.test(data.telefono)) {
      errors.push('telefono: formato inválido');
    }
  }

  if (data.email !== undefined && data.email !== null) {
    if (typeof data.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push('email: formato inválido');
    }
  }

  if (data.fecha_nacimiento !== undefined && data.fecha_nacimiento !== null) {
    const d = new Date(data.fecha_nacimiento);
    if (isNaN(d.getTime()) || d > new Date()) {
      errors.push('fecha_nacimiento: fecha inválida o futura');
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
// Lista todos los pacientes con filtros opcionales
// Query params: ?estado=activo&search=juan
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  let result = [...patients];

  // Filtro por estado
  if (req.query.estado) {
    if (!VALID_ESTADOS.includes(req.query.estado)) {
      return res.status(400).json({
        error: `estado inválido. Valores permitidos: ${VALID_ESTADOS.join(', ')}`
      });
    }
    result = result.filter(p => p.estado === req.query.estado);
  }

  // Búsqueda por nombre o RUT
  if (req.query.search) {
    const term = req.query.search.toLowerCase().trim();
    result = result.filter(p =>
      p.nombre.toLowerCase().includes(term) ||
      p.rut.toLowerCase().includes(term)
    );
  }

  res.json({
    total: result.length,
    pacientes: result
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/pacientes/:id
// Ficha completa de un paciente
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const patient = patients.find(p => p.id === id);

  if (!patient) {
    return res.status(404).json({ error: `Paciente con ID ${id} no encontrado` });
  }

  res.json(patient);
});

// ---------------------------------------------------------------------------
// POST /api/v1/pacientes
// Crear nueva ficha de paciente
// Body: { nombre, rut, telefono?, email?, fecha_nacimiento?, direccion?,
//         prevision?, alergias?, notas_medicas? }
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const errors = validatePatient(req.body, true);

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: errors });
  }

  // ⚠️ Verificar RUT duplicado
  const rutNormalizado = req.body.rut.trim().toLowerCase();
  const existe = patients.find(p => p.rut.toLowerCase() === rutNormalizado);

  if (existe) {
    return res.status(409).json({
      error: 'Ya existe un paciente con este RUT',
      paciente_id: existe.id
    });
  }

  const nuevoPaciente = {
    id: nextId++,
    nombre: req.body.nombre.trim(),
    rut: req.body.rut.trim(),
    telefono: req.body.telefono?.trim() || null,
    email: req.body.email?.trim().toLowerCase() || null,
    fecha_nacimiento: req.body.fecha_nacimiento || null,
    direccion: req.body.direccion?.trim() || null,
    prevision: req.body.prevision?.trim() || null,        // FONASA, Isapre, etc.
    alergias: req.body.alergias || [],                    // Array de strings
    notas_medicas: req.body.notas_medicas?.trim() || null,
    estado: 'activo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  patients.push(nuevoPaciente);

  res.status(201).json({
    message: 'Paciente registrado exitosamente',
    paciente: nuevoPaciente
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/pacientes/:id
// Actualizar ficha completa (todos los campos)
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const index = patients.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Paciente con ID ${id} no encontrado` });
  }

  const errors = validatePatient(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: errors });
  }

  // ⚠️ Verificar RUT duplicado en otros pacientes
  const rutNormalizado = req.body.rut.trim().toLowerCase();
  const duplicado = patients.find(
    p => p.rut.toLowerCase() === rutNormalizado && p.id !== id
  );

  if (duplicado) {
    return res.status(409).json({
      error: 'Ese RUT ya está registrado en otro paciente',
      paciente_id: duplicado.id
    });
  }

  patients[index] = {
    ...patients[index],
    nombre: req.body.nombre.trim(),
    rut: req.body.rut.trim(),
    telefono: req.body.telefono?.trim() || null,
    email: req.body.email?.trim().toLowerCase() || null,
    fecha_nacimiento: req.body.fecha_nacimiento || null,
    direccion: req.body.direccion?.trim() || null,
    prevision: req.body.prevision?.trim() || null,
    alergias: req.body.alergias || [],
    notas_medicas: req.body.notas_medicas?.trim() || null,
    estado: req.body.estado || patients[index].estado,
    updated_at: new Date().toISOString()
  };

  res.json({
    message: 'Paciente actualizado',
    paciente: patients[index]
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/pacientes/:id
// Actualización parcial — solo los campos que mandas
// Útil para cambiar estado, agregar nota, etc.
// ---------------------------------------------------------------------------
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const index = patients.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Paciente con ID ${id} no encontrado` });
  }

  const errors = validatePatient(req.body, false);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos inválidos', detalles: errors });
  }

  // Campos que NO se pueden cambiar vía PATCH
  const { id: _id, created_at, ...updates } = req.body;

  patients[index] = {
    ...patients[index],
    ...updates,
    id: patients[index].id,           // ID inmutable
    created_at: patients[index].created_at, // fecha creación inmutable
    updated_at: new Date().toISOString()
  };

  res.json({
    message: 'Paciente actualizado parcialmente',
    paciente: patients[index]
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/pacientes/:id
// Soft delete → cambia estado a 'inactivo', no borra el registro
// ⚠️ En odontología NUNCA se borran fichas — son historial clínico
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const index = patients.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: `Paciente con ID ${id} no encontrado` });
  }

  if (patients[index].estado === 'inactivo') {
    return res.status(409).json({ error: 'El paciente ya está inactivo' });
  }

  // Soft delete — historial clínico es intocable
  patients[index].estado = 'inactivo';
  patients[index].updated_at = new Date().toISOString();

  res.json({
    message: 'Paciente marcado como inactivo (registro preservado)',
    paciente: patients[index]
  });
});

module.exports = router;