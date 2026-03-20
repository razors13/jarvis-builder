// src/routes/appointments.js
// JARVIS OS — Modulo Clinica: Citas Dentales
// MIGRADO A SUPABASE — datos persisten entre reinicios

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------
const VALID_ESTADOS = ['programada', 'confirmada', 'completada', 'cancelada', 'no_asistio'];

const VALID_TRATAMIENTOS = [
  'consulta_general', 'limpieza', 'extraccion', 'endodoncia',
  'ortodoncia', 'implante', 'blanqueamiento', 'radiografia', 'otro'
];

const DURACION_DEFAULT = {
  consulta_general: 30, limpieza: 60, extraccion: 45,
  endodoncia: 90, ortodoncia: 60, implante: 120,
  blanqueamiento: 90, radiografia: 20, otro: 30
};

const HORARIO = { inicio: 9, fin: 19, dias_habil: [1, 2, 3, 4, 5, 6] };

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------
function calcularFin(inicio, duracionMinutos) {
  return new Date(new Date(inicio).getTime() + duracionMinutos * 60000);
}

function dentroDeHorario(inicio, fin) {
  const d = new Date(inicio);
  const f = new Date(fin);
  if (!HORARIO.dias_habil.includes(d.getDay())) return false;
  const hi = d.getHours() + d.getMinutes() / 60;
  const hf = f.getHours() + f.getMinutes() / 60;
  return hi >= HORARIO.inicio && hf <= HORARIO.fin;
}

function validateAppointment(data, requireAll = true) {
  const errors = [];

  if (requireAll || data.paciente_id !== undefined) {
    const pid = parseInt(data.paciente_id);
    if (!data.paciente_id || isNaN(pid) || pid < 1) {
      errors.push('paciente_id: requerido');
    }
  }

  if (requireAll || data.fecha_hora !== undefined) {
    if (!data.fecha_hora) {
      errors.push('fecha_hora: requerido (ISO: 2026-03-20T10:00:00)');
    } else {
      const d = new Date(data.fecha_hora);
      if (isNaN(d.getTime())) errors.push('fecha_hora: formato invalido');
      else if (d < new Date()) errors.push('fecha_hora: no puede ser en el pasado');
    }
  }

  if (requireAll || data.tratamiento !== undefined) {
    if (!data.tratamiento || !VALID_TRATAMIENTOS.includes(data.tratamiento)) {
      errors.push(`tratamiento: debe ser uno de [${VALID_TRATAMIENTOS.join(', ')}]`);
    }
  }

  if (data.estado !== undefined && !VALID_ESTADOS.includes(data.estado)) {
    errors.push(`estado: debe ser uno de [${VALID_ESTADOS.join(', ')}]`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// DETECCION DE CONFLICTOS EN SUPABASE
// Busca citas activas que se superpongan con el rango dado
// ---------------------------------------------------------------------------
async function detectarConflicto(inicio, fin, excludeId = null) {
  const inicioISO = new Date(inicio).toISOString();
  const finISO = new Date(fin).toISOString();

  let query = supabase
    .from('citas')
    .select('id, paciente_id, fecha_hora_inicio, fecha_hora_fin, tratamiento')
    .not('estado', 'in', '("cancelada","no_asistio")')
    .lt('fecha_hora_inicio', finISO)
    .gt('fecha_hora_fin', inicioISO);

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query.limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

// ---------------------------------------------------------------------------
// GET /api/v1/citas
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('citas')
      .select('*')
      .order('fecha_hora_inicio', { ascending: true });

    if (req.query.paciente_id) {
      const pid = parseInt(req.query.paciente_id);
      if (isNaN(pid)) return res.status(400).json({ error: 'paciente_id invalido' });
      query = query.eq('paciente_id', pid);
    }

    if (req.query.estado) {
      if (!VALID_ESTADOS.includes(req.query.estado)) {
        return res.status(400).json({ error: `estado invalido` });
      }
      query = query.eq('estado', req.query.estado);
    }

    if (req.query.fecha) {
      const fecha = req.query.fecha.substring(0, 10);
      query = query
        .gte('fecha_hora_inicio', `${fecha}T00:00:00`)
        .lte('fecha_hora_inicio', `${fecha}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ total: data.length, citas: data });

  } catch (error) {
    console.error('GET /citas error:', error);
    res.status(500).json({ error: 'Error al obtener citas', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/citas/disponibilidad
// ---------------------------------------------------------------------------
router.get('/disponibilidad', async (req, res) => {
  try {
    if (!req.query.fecha) {
      return res.status(400).json({ error: 'fecha requerida (formato: 2026-03-20)' });
    }

    const tratamiento = req.query.tratamiento || 'consulta_general';
    const duracion = DURACION_DEFAULT[tratamiento] || 30;
    const fecha = req.query.fecha.substring(0, 10);

    const slots = [];
    for (let h = HORARIO.inicio; h < HORARIO.fin; h++) {
      for (let m = 0; m < 60; m += 30) {
        const inicio = new Date(`${fecha}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
        const fin = calcularFin(inicio, duracion);

        if (fin.getHours() + fin.getMinutes()/60 <= HORARIO.fin) {
          const conflicto = await detectarConflicto(inicio, fin);
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

    res.json({
      fecha,
      tratamiento,
      duracion_minutos: duracion,
      slots_disponibles: slots.filter(s => s.disponible).length,
      slots
    });

  } catch (error) {
    console.error('GET /disponibilidad error:', error);
    res.status(500).json({ error: 'Error al obtener disponibilidad', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/citas/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data, error } = await supabase
      .from('citas')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Cita ${id} no encontrada` });
      }
      throw error;
    }

    res.json(data);

  } catch (error) {
    console.error('GET /citas/:id error:', error);
    res.status(500).json({ error: 'Error al obtener cita', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/citas
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const errors = validateAppointment(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
    }

    const inicio = new Date(req.body.fecha_hora);
    const duracion = parseInt(req.body.duracion_minutos) ||
                     DURACION_DEFAULT[req.body.tratamiento] || 30;
    const fin = calcularFin(inicio, duracion);

    if (!dentroDeHorario(inicio, fin)) {
      return res.status(400).json({
        error: 'Fuera del horario de atencion',
        horario: `Lunes a Sabado, ${HORARIO.inicio}:00 - ${HORARIO.fin}:00`
      });
    }

    const conflicto = await detectarConflicto(inicio, fin);
    if (conflicto) {
      return res.status(409).json({
        error: 'Conflicto de horario',
        cita_existente: {
          id: conflicto.id,
          paciente_id: conflicto.paciente_id,
          inicio: conflicto.fecha_hora_inicio,
          fin: conflicto.fecha_hora_fin,
          tratamiento: conflicto.tratamiento
        }
      });
    }

    const { data, error } = await supabase
      .from('citas')
      .insert({
        paciente_id: parseInt(req.body.paciente_id),
        fecha_hora_inicio: inicio.toISOString(),
        fecha_hora_fin: fin.toISOString(),
        duracion_minutos: duracion,
        tratamiento: req.body.tratamiento,
        estado: 'programada',
        notas: req.body.notas?.trim() || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Cita registrada exitosamente', cita: data });

  } catch (error) {
    console.error('POST /citas error:', error);
    res.status(500).json({ error: 'Error al crear cita', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/citas/:id — actualizar estado o notas
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    if (req.body.fecha_hora) {
      return res.status(400).json({
        error: 'Para cambiar horario usa PUT /api/v1/citas/:id'
      });
    }

    const { id: _id, created_at, fecha_hora, ...updates } = req.body;

    const { data, error } = await supabase
      .from('citas')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Cita ${id} no encontrada` });
      }
      throw error;
    }

    res.json({ message: 'Cita actualizada', cita: data });

  } catch (error) {
    console.error('PATCH /citas/:id error:', error);
    res.status(500).json({ error: 'Error al actualizar cita', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/citas/:id — cancelar cita
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data: cita } = await supabase
      .from('citas')
      .select('estado')
      .eq('id', id)
      .single();

    if (!cita) return res.status(404).json({ error: `Cita ${id} no encontrada` });
    if (cita.estado === 'cancelada') return res.status(409).json({ error: 'La cita ya esta cancelada' });
    if (cita.estado === 'completada') return res.status(409).json({ error: 'No se puede cancelar una cita completada' });

    const { data, error } = await supabase
      .from('citas')
      .update({ estado: 'cancelada', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Cita cancelada (registro preservado)', cita: data });

  } catch (error) {
    console.error('DELETE /citas/:id error:', error);
    res.status(500).json({ error: 'Error al cancelar cita', details: error.message });
  }
});

module.exports = router;