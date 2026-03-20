const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

/**
 * GET /api/v1/evoluciones?paciente_id=1
 * Lista todas las evoluciones del paciente ordenadas por fecha DESC
 */
router.get('/', async (req, res) => {
  try {
    const { paciente_id } = req.query;

    if (!paciente_id) {
      return res.status(400).json({ error: 'paciente_id es requerido' });
    }

    const { data, error } = await supabase
      .from('evoluciones')
      .select('*')
      .eq('paciente_id', paciente_id)
      .order('fecha_hora', { ascending: false });

    if (error) throw error;

    res.json({ evoluciones: data || [] });
  } catch (error) {
    console.error('Error al obtener evoluciones:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/evoluciones/:id
 * Evolución individual con snapshot del odontograma
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('evoluciones')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Evolución no encontrada' });
      }
      throw error;
    }

    res.json(data);
  } catch (error) {
    console.error('Error al obtener evolución:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/evoluciones
 * Crea una nueva evolución con snapshot del odontograma actual
 */
router.post('/', async (req, res) => {
  try {
    const {
      paciente_id,
      tratamiento,
      dientes_tratados,
      materiales,
      anestesia_tipo,
      notas,
      cobro
    } = req.body;

    // Validaciones
    if (!paciente_id) {
      return res.status(400).json({ error: 'paciente_id es requerido' });
    }

    if (!tratamiento || tratamiento.trim().length < 3) {
      return res.status(400).json({ 
        error: 'tratamiento es requerido y debe tener al menos 3 caracteres' 
      });
    }

    if (dientes_tratados && Array.isArray(dientes_tratados)) {
      const invalidTeeth = dientes_tratados.filter(d => {
        const num = parseInt(d);
        return isNaN(num) || num < 11 || num > 48;
      });
      
      if (invalidTeeth.length > 0) {
        return res.status(400).json({ 
          error: 'dientes_tratados debe contener números entre 11 y 48' 
        });
      }
    }

    if (cobro !== undefined && cobro !== null) {
      const cobroNum = parseFloat(cobro);
      if (isNaN(cobroNum) || cobroNum < 0) {
        return res.status(400).json({ 
          error: 'cobro debe ser un número positivo' 
        });
      }
    }

    // 1. Validar que el paciente existe
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .select('id, odontograma')
      .eq('id', paciente_id)
      .single();

    if (pacienteError) {
      if (pacienteError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Paciente no encontrado' });
      }
      throw pacienteError;
    }

    // 2. Obtener el odontograma actual del paciente
    const snapshot_odontograma = paciente.odontograma || null;

    // 3. Preparar datos para insertar
    const evolucionData = {
      paciente_id,
      tratamiento: tratamiento.trim(),
      dientes_tratados: dientes_tratados || [],
      materiales: materiales || null,
      anestesia_tipo: anestesia_tipo || null,
      notas: notas || null,
      cobro: cobro || null,
      snapshot_odontograma,
      fecha_hora: new Date().toISOString()
    };

    // 4. Insertar la evolución
    const { data: nuevaEvolucion, error: insertError } = await supabase
      .from('evoluciones')
      .insert([evolucionData])
      .select()
      .single();

    if (insertError) throw insertError;

    // 5. Responder con la evolución creada
    res.status(201).json({
      message: 'Evolución creada exitosamente',
      evolucion: nuevaEvolucion
    });

  } catch (error) {
    console.error('Error al crear evolución:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/v1/evoluciones/:id
 * Actualiza campos permitidos de una evolución
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { notas, cobro, estado_pago, materiales } = req.body;

    // Validar que al menos un campo permitido esté presente
    if (notas === undefined && cobro === undefined && 
        estado_pago === undefined && materiales === undefined) {
      return res.status(400).json({ 
        error: 'Debe proporcionar al menos un campo para actualizar (notas, cobro, estado_pago, materiales)' 
      });
    }

    // Validar cobro si se proporciona
    if (cobro !== undefined && cobro !== null) {
      const cobroNum = parseFloat(cobro);
      if (isNaN(cobroNum) || cobroNum < 0) {
        return res.status(400).json({ 
          error: 'cobro debe ser un número positivo' 
        });
      }
    }

    // Validar estado_pago si se proporciona
    if (estado_pago !== undefined) {
      const estadosValidos = ['pendiente', 'pagado', 'parcial'];
      if (!estadosValidos.includes(estado_pago)) {
        return res.status(400).json({ 
          error: 'estado_pago debe ser: pendiente, pagado o parcial' 
        });
      }
    }

    // Verificar que la evolución existe
    const { data: evolucionExistente, error: checkError } = await supabase
      .from('evoluciones')
      .select('id')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Evolución no encontrada' });
      }
      throw checkError;
    }

    // Preparar datos para actualizar
    const updateData = {};
    if (notas !== undefined) updateData.notas = notas;
    if (cobro !== undefined) updateData.cobro = cobro;
    if (estado_pago !== undefined) updateData.estado_pago = estado_pago;
    if (materiales !== undefined) updateData.materiales = materiales;

    // Actualizar
    const { data: evolucionActualizada, error: updateError } = await supabase
      .from('evoluciones')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      message: 'Evolución actualizada exitosamente',
      evolucion: evolucionActualizada
    });

  } catch (error) {
    console.error('Error al actualizar evolución:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/v1/evoluciones/:id
 * Elimina (soft delete) una evolución solo si estado_pago es 'pendiente'
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que la evolución existe y obtener su estado_pago
    const { data: evolucion, error: checkError } = await supabase
      .from('evoluciones')
      .select('id, estado_pago, cancelado')
      .eq('id', id)
      .single();

    if (checkError) {
      if (checkError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Evolución no encontrada' });
      }
      throw checkError;
    }

    // Verificar si ya está cancelada
    if (evolucion.cancelado) {
      return res.status(400).json({ error: 'La evolución ya está cancelada' });
    }

    // Verificar que el estado_pago sea 'pendiente'
    if (evolucion.estado_pago !== 'pendiente') {
      return res.status(400).json({ 
        error: 'Solo se pueden eliminar evoluciones con estado_pago pendiente' 
      });
    }

    // Soft delete: marcar como cancelado
    const { data: evolucionCancelada, error: deleteError } = await supabase
      .from('evoluciones')
      .update({ cancelado: true })
      .eq('id', id)
      .select()
      .single();

    if (deleteError) throw deleteError;

    res.json({
      message: 'Evolución cancelada exitosamente',
      evolucion: evolucionCancelada
    });

  } catch (error) {
    console.error('Error al eliminar evolución:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
