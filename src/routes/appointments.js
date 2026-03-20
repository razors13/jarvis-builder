// src/routes/appointments.js
// JARVIS OS - Modulo Clinica: Citas Dentales
// FASE 1: Storage en memoria. Migracion a Supabase en Semana 2.
// ADVERTENCIA: Los datos se pierden al reiniciar el servidor.

const express = require('express');
const router = express.Router();

// ---------------------------------------------------------------------------
// IN-MEMORY STORE
// ---------------------------------------------------------------------------
let appointments = [];
let nextId = 1;

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------
const VALID_ESTADOS = ['programada', 'confirmada', 'completada', 'cancelada', 'no_asistio'];

const VALID_TRATAMIENTOS = [
  'consulta_general',
  'limpieza',
  'extraccion',
  'endodoncia',
  'ortodoncia',
  'implante',
  'blanqueamiento',
  'radiografia',
  'otro'
];

// Duracion en minutos por tratamiento (para calcular fin de cita)
const DURACION_DEFAULT = {
  consulta_general: 30,
  limpieza: 60,
  extraccion: 45,
  endodoncia: 90,
  ortodoncia: 60,
  implante: 120,
  blanqueamiento: 90,
  radiografia: 20,
  otro: 30
};

// Horario de atencion: lunes a sabado, 09:00 - 19:00
const HORARIO = {
  inicio: 9,
  fin: 19,
  // 0=domingo, 1=lunes ... 6=sabado
  dias_habil: [1, 2, 3, 4, 5, 6]
};

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------

// Parsea "2026-03-20T10:00" y devuelve Date en UTC
function parseDateTime(str) {
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// Calcula fecha/hora de fin segun duracion
function calcularFin(inicio, duracionMinutos) {
  return new Date(inicio.getTime() + duracionMinutos * 60000);
}

// Verifica si dos rangos de tiempo se solapan
// [a_inicio, a_fin) vs [b_inicio, b_fin) -> solapan si a_inicio < b_fin && b_inicio < a_fin
function seSuperponen(aInicio, aFin, bInicio, bFin) {
  return aInicio < bFin && bInicio < aFin;
}

// Valida que la cita cae dentro del horario de atencion
function dentroDeHorario(inicio, fin) {
  const dia = inicio.getDay();
  if (!HORARIO.dias_habil.includes(dia)) return false;
  const horaInicio = inicio.getHours() + inicio.getMinutes() / 60;
  const horaFin = fin.getHours() + fin.getMinutes() / 60;
  return horaInicio >= HORARIO.inicio && horaFin <= HORARIO.fin;
}

// ---------------------------------------------------------------------------
// VALIDACION
// ---------------------------------------------------------------------------
function validateAppointment(data, requireAll = true) {
  const errors = [];

  if (requireAll || data.paciente_id !== undefined) {
    const pid = parseInt(data.paciente_id);
    if (!data.paciente_id || isNaN(pid) || pid < 1) {
      errors.push('paciente_id: requerido, debe ser un ID valido');
    }
  }

  if (requireAll || data.fecha_hora !== undefined) {
    if (!data.fecha_hora) {
      errors.push('fecha_hora: requerido (formato ISO: 2026-03-20T10:00:00)');
    } else {
      const d = parseDateTime(data.fecha_hora);
      if (!d) errors.push('fecha_hora: formato invalido');
      else if (d < new Date()) errors.push('fecha_hora: no puede ser en el pasado');
    }
  }

  if (requireAll || data.tratamiento !== undefined) {
    if (!data.tratamiento || !VALID_TRATAMIENTOS.includes(data.tratamiento)) {
      errors.push(`tratamiento: debe ser uno de [${VALID_TRATAMIENTOS.join(', ')}]`);
    }
  }

  if (data.duracion_minutos !== undefined && data.duracion_minutos !== null) {
    const d = parseInt(data.duracion_minutos);
    if (isNaN(d) || d < 10 || d > 480) {
      errors.push('duracion_minutos: debe ser entre 10 y 480');
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
// DETECCION DE CONFLICTOS
// El corazon del modulo. Como un order book: no pueden existir dos
// posiciones abiertas en el mismo instrumento y al mismo tiempo.
// ---------------------------------------------------------------------------
function detectarConflicto(inicio, fin, excludeId = null) {
  return appointments.find(apt => {
    if (apt.id === excludeId) return false;
    if (['cancelada', 'no_asistio'].includes(apt.estado)) return false;
    return seSuperponen(inicio, fin, apt.fecha_hora_inicio, apt.fecha_hora_fin);
  });
}

// ---------------------------------------------------------------------------
// GET /api/v1/citas
// Filtros: ?paciente_id=1 &estado=programada &fecha=2026-03-20
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  let result = [...appointments];

  if (req.query.paciente_id) {
    const pid = parseInt(req.query.paciente_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'paciente_id invalido' });
    result = result.filter(a => a.paciente_id === pid);
  }

  if (req.query.estado) {
    if (!VALID_ESTADOS.includes(req.query.estado)) {
      return res.status(400).json({
        error: `estado invalido. Valores: ${VALID_ESTADOS.join(', ')}`
      });
    }
    result = result.filter(a => a.estado === req.query.estado);
  }

  if (req.query.fecha) {
    const fechaBuscar = req.query.fecha.substring(0, 10);
    result = result.filter(a =>
      a.fecha_hora_inicio.toISOString().substring(0, 10) === fechaBuscar
    );
  }

  // Ordenar por fecha ascendente
  result.sort((a, b) => a.fecha_hora_inicio - b.fecha_hora_inicio);

  res.json({
    total: result.length,
    citas: result.map(formatCita)
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/citas/disponibilidad?fecha=2026-03-20&tratamiento=limpieza
// Muestra slots disponibles en un dia
// ---------------------------------------------------------------------------
router.get('/disponibilidad', (req, res) => {
  if (!req.query.fecha) {
    return res.status(400).json({ error: 'fecha requerida (formato: 2026-03-20)' });
  }

  const tratamiento = req.query.tratamiento || 'consulta_general';
  const duracion = DURACION_DEFAULT[tratamiento] || 30;
  const fecha = req.query.fecha.substring(0, 10);

  // Generar slots cada 30 minutos en el horario habitual
  const slots = [];
  for (let h = HORARIO.inicio; h < HORARIO.fin; h++) {
    for (let m = 0; m < 60; m += 30) {
      const inicio = new Date(`${fecha}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
      const fin = calcularFin(inicio, duracion);

      // Slot valido: dentro de horario y sin conflicto
      if (fin.getHours() + fin.getMinutes()/60 <= HORARIO.fin) {
        const conflicto = detectarConflicto(inicio, fin);
        slots.push({
          hora: `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,
          inicio: inicio.toISOString(),
          fin: fin.toISOString(),
          disponible: !conflicto,
          duracion_minutos: duracion
        });
      }
    }
  }

  const disponibles = slots.filter(s => s.disponible).length;

  res.json({
    fecha,
    tratamiento,
    duracion_minutos: duracion,
    slots_disponibles: disponibles,
    slots
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/citas/:id
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

  const cita = appointments.find(a => a.id === id);
  if (!cita) return res.status(404).json({ error: `Cita ${id} no encontrada` });

  res.json(formatCita(cita));
});

// ---------------------------------------------------------------------------
// POST /api/v1/citas
// Crear cita con deteccion de conflictos
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const errors = validateAppointment(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
  }

  const inicio = parseDateTime(req.body.fecha_hora);
  const duracion = parseInt(req.body.duracion_minutos) ||
                   DURACION_DEFAULT[req.body.tratamiento] || 30;
  const fin = calcularFin(inicio, duracion);

  // Validar horario de atencion
  if (!dentroDeHorario(inicio, fin)) {
    return res.status(400).json({
      error: 'La cita cae fuera del horario de atencion',
      horario: `Lunes a Sabado, ${HORARIO.inicio}:00 - ${HORARIO.fin}:00`
    });
  }

  // DETECCION DE CONFLICTO
  // Si ya existe una cita activa en ese rango, rechazar
  const conflicto = detectarConflicto(inicio, fin);
  if (conflicto) {
    return res.status(409).json({
      error: 'Conflicto de horario',
      mensaje: 'Ya existe una cita en ese horario',
      cita_existente: {
        id: conflicto.id,
        paciente_id: conflicto.paciente_id,
        inicio: conflicto.fecha_hora_inicio.toISOString(),
        fin: conflicto.fecha_hora_fin.toISOString(),
        tratamiento: conflicto.tratamiento
      }
    });
  }

  const nuevaCita = {
    id: nextId++,
    paciente_id: parseInt(req.body.paciente_id),
    fecha_hora_inicio: inicio,
    fecha_hora_fin: fin,
    duracion_minutos: duracion,
    tratamiento: req.body.tratamiento,
    estado: 'programada',
    notas: req.body.notas?.trim() || null,
    created_at: new Date(),
    updated_at: new Date()
  };

  appointments.push(nuevaCita);

  res.status(201).json({
    message: 'Cita registrada exitosamente',
    cita: formatCita(nuevaCita)
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/citas/:id
// Actualizar estado o notas. Para cambiar horario usar PUT.
// ---------------------------------------------------------------------------
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

  const index = appointments.findIndex(a => a.id === id);
  if (index === -1) return res.status(404).json({ error: `Cita ${id} no encontrada` });

  const errors = validateAppointment(req.body, false);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
  }

  // Bloquear cambio de horario via PATCH
  if (req.body.fecha_hora) {
    return res.status(400).json({
      error: 'Para cambiar el horario usa PUT /api/v1/citas/:id',
      razon: 'PATCH solo actualiza estado y notas'
    });
  }

  const { id: _id, created_at, fecha_hora, ...updates } = req.body;

  appointments[index] = {
    ...appointments[index],
    ...updates,
    id: appointments[index].id,
    created_at: appointments[index].created_at,
    updated_at: new Date()
  };

  res.json({
    message: 'Cita actualizada',
    cita: formatCita(appointments[index])
  });
});

// ---------------------------------------------------------------------------
// PUT /api/v1/citas/:id
// Reprogramar cita (cambia fecha/hora con nueva validacion de conflictos)
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

  const index = appointments.findIndex(a => a.id === id);
  if (index === -1) return res.status(404).json({ error: `Cita ${id} no encontrada` });

  const cita = appointments[index];

  // No se pueden reprogramar citas ya completadas o canceladas
  if (['completada', 'cancelada'].includes(cita.estado)) {
    return res.status(409).json({
      error: `No se puede reprogramar una cita en estado '${cita.estado}'`
    });
  }

  const errors = validateAppointment(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
  }

  const inicio = parseDateTime(req.body.fecha_hora);
  const duracion = parseInt(req.body.duracion_minutos) ||
                   DURACION_DEFAULT[req.body.tratamiento] || 30;
  const fin = calcularFin(inicio, duracion);

  if (!dentroDeHorario(inicio, fin)) {
    return res.status(400).json({
      error: 'La cita cae fuera del horario de atencion',
      horario: `Lunes a Sabado, ${HORARIO.inicio}:00 - ${HORARIO.fin}:00`
    });
  }

  // Conflicto excluyendo la propia cita (permite reprogramar al mismo slot)
  const conflicto = detectarConflicto(inicio, fin, id);
  if (conflicto) {
    return res.status(409).json({
      error: 'Conflicto de horario al reprogramar',
      cita_existente: {
        id: conflicto.id,
        inicio: conflicto.fecha_hora_inicio.toISOString(),
        fin: conflicto.fecha_hora_fin.toISOString(),
        tratamiento: conflicto.tratamiento
      }
    });
  }

  appointments[index] = {
    ...cita,
    paciente_id: parseInt(req.body.paciente_id),
    fecha_hora_inicio: inicio,
    fecha_hora_fin: fin,
    duracion_minutos: duracion,
    tratamiento: req.body.tratamiento,
    notas: req.body.notas?.trim() || cita.notas,
    estado: 'programada', // reprogramar resetea a programada
    updated_at: new Date()
  };

  res.json({
    message: 'Cita reprogramada exitosamente',
    cita: formatCita(appointments[index])
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/citas/:id
// Cancela la cita (soft delete — preserva historial)
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

  const index = appointments.findIndex(a => a.id === id);
  if (index === -1) return res.status(404).json({ error: `Cita ${id} no encontrada` });

  if (appointments[index].estado === 'cancelada') {
    return res.status(409).json({ error: 'La cita ya esta cancelada' });
  }

  if (appointments[index].estado === 'completada') {
    return res.status(409).json({
      error: 'No se puede cancelar una cita completada'
    });
  }

  appointments[index].estado = 'cancelada';
  appointments[index].updated_at = new Date();

  res.json({
    message: 'Cita cancelada (registro preservado en historial)',
    cita: formatCita(appointments[index])
  });
});

// ---------------------------------------------------------------------------
// FORMATO DE SALIDA
// Serializa fechas a ISO string para la respuesta
// ---------------------------------------------------------------------------
function formatCita(cita) {
  return {
    ...cita,
    fecha_hora_inicio: cita.fecha_hora_inicio.toISOString(),
    fecha_hora_fin: cita.fecha_hora_fin.toISOString(),
    created_at: cita.created_at.toISOString(),
    updated_at: cita.updated_at.toISOString()
  };
}

module.exports = router;