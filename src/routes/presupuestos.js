const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

const VALID_PRESUPUESTO_ESTADOS = ['borrador', 'enviado', 'aprobado', 'rechazado', 'completado'];
const VALID_ITEM_ESTADOS = ['pendiente', 'pagado', 'cancelado'];

// GET /api/v1/presupuestos?paciente_id=X
// Lista presupuestos del paciente con items incluidos
router.get('/', async (req, res) => {
  try {
    const { paciente_id } = req.query;
    const user = req.user;

    if (!paciente_id) {
      return res.status(400).json({ error: 'paciente_id es requerido' });
    }

    // Obtener presupuestos del paciente
    let query = supabase
      .from('presupuestos')
      .select('*')
      .eq('paciente_id', paciente_id)
      .order('created_at', { ascending: false });

    // Si es doctor, solo ver sus propios presupuestos
    if (user.role === 'doctor') {
      query = query.eq('doctor_id', user.id);
    }

    const { data: presupuestos, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Obtener items para cada presupuesto
    const presupuestosConItems = await Promise.all(
      (presupuestos || []).map(async (presupuesto) => {
        const { data: items, error: itemsError } = await supabase
          .from('presupuesto_items')
          .select('*')
          .eq('presupuesto_id', presupuesto.id)
          .order('created_at', { ascending: false });

        if (itemsError) {
          console.error('Error obteniendo items:', itemsError);
          return { ...presupuesto, items: [] };
        }

        return { ...presupuesto, items: items || [] };
      })
    );

    res.json(presupuestosConItems);
  } catch (err) {
    console.error('Error en GET presupuestos:', err);
    res.status(500).json({ error: 'Error al obtener presupuestos' });
  }
});

// POST /api/v1/presupuestos
// Crear nuevo presupuesto con items
router.post('/', async (req, res) => {
  try {
    const { paciente_id, nota, descuento_global = 0, items = [] } = req.body;
    const user = req.user;

    // Validaciones
    if (!paciente_id) {
      return res.status(400).json({ error: 'paciente_id es requerido' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items es requerido y debe tener al menos 1 item' });
    }

    // Validar cada item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.tratamiento || !item.diente || !item.cantidad || item.precio_unitario === undefined) {
        return res.status(400).json({
          error: `Item ${i}: tratamiento, diente, cantidad y precio_unitario son requeridos`
        });
      }
      if (typeof item.cantidad !== 'number' || item.cantidad <= 0) {
        return res.status(400).json({ error: `Item ${i}: cantidad debe ser un número positivo` });
      }
      if (typeof item.precio_unitario !== 'number' || item.precio_unitario < 0) {
        return res.status(400).json({ error: `Item ${i}: precio_unitario debe ser un número no negativo` });
      }
    }

    // Calcular subtotales de items y total
    let totalPresupuesto = 0;
    const itemsConSubtotal = items.map((item) => {
      const descuentoItem = item.descuento || 0;
      const subtotal = item.cantidad * item.precio_unitario * (1 - descuentoItem / 100);
      totalPresupuesto += subtotal;
      return {
        ...item,
        subtotal
      };
    });

    // Aplicar descuento global
    const totalFinal = totalPresupuesto * (1 - descuento_global / 100);

    // Insertar presupuesto
    const { data: presupuesto, error: presupuestoError } = await supabase
      .from('presupuestos')
      .insert([
        {
          paciente_id,
          doctor_id: user.id,
          nota: nota || null,
          descuento_global,
          subtotal: totalPresupuesto,
          total: totalFinal,
          estado: 'borrador'
        }
      ])
      .select()
      .single();

    if (presupuestoError) {
      return res.status(500).json({ error: presupuestoError.message });
    }

    // Insertar items
    const itemsParaInsertar = itemsConSubtotal.map((item) => ({
      presupuesto_id: presupuesto.id,
      tratamiento: item.tratamiento,
      diente: item.diente,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      descuento: item.descuento || 0,
      subtotal: item.subtotal,
      estado: 'pendiente'
    }));

    const { data: itemsInsertados, error: itemsError } = await supabase
      .from('presupuesto_items')
      .insert(itemsParaInsertar)
      .select();

    if (itemsError) {
      // Intentar eliminar el presupuesto si falla la inserción de items
      await supabase.from('presupuestos').delete().eq('id', presupuesto.id);
      return res.status(500).json({ error: itemsError.message });
    }

    res.status(201).json({
      ...presupuesto,
      items: itemsInsertados || []
    });
  } catch (err) {
    console.error('Error en POST presupuestos:', err);
    res.status(500).json({ error: 'Error al crear presupuesto' });
  }
});

// PATCH /api/v1/presupuestos/:id
// Actualizar estado del presupuesto
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    const user = req.user;

    if (!estado) {
      return res.status(400).json({ error: 'estado es requerido' });
    }

    if (!VALID_PRESUPUESTO_ESTADOS.includes(estado)) {
      return res.status(400).json({
        error: `estado debe ser uno de: ${VALID_PRESUPUESTO_ESTADOS.join(', ')}`
      });
    }

    // Obtener presupuesto actual
    const { data: presupuesto, error: getError } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('id', id)
      .single();

    if (getError || !presupuesto) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    // Validar permisos: solo admin o doctor propietario
    if (user.role === 'doctor' && presupuesto.doctor_id !== user.id) {
      return res.status(403).json({ error: 'No tienes permiso para actualizar este presupuesto' });
    }

    // Actualizar estado
    const { data: actualizado, error: updateError } = await supabase
      .from('presupuestos')
      .update({ estado })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Obtener items actualizados
    const { data: items } = await supabase
      .from('presupuesto_items')
      .select('*')
      .eq('presupuesto_id', id);

    res.json({
      ...actualizado,
      items: items || []
    });
  } catch (err) {
    console.error('Error en PATCH presupuestos/:id:', err);
    res.status(500).json({ error: 'Error al actualizar presupuesto' });
  }
});

// PATCH /api/v1/presupuestos/:id/items/:item_id
// Actualizar estado de un item y recalcular total del presupuesto
router.patch('/:id/items/:item_id', async (req, res) => {
  try {
    const { id, item_id } = req.params;
    const { estado } = req.body;
    const user = req.user;

    if (!estado) {
      return res.status(400).json({ error: 'estado es requerido' });
    }

    if (!VALID_ITEM_ESTADOS.includes(estado)) {
      return res.status(400).json({
        error: `estado debe ser uno de: ${VALID_ITEM_ESTADOS.join(', ')}`
      });
    }

    // Obtener presupuesto
    const { data: presupuesto, error: presupuestoError } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('id', id)
      .single();

    if (presupuestoError || !presupuesto) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    // Validar permisos
    if (user.role === 'doctor' && presupuesto.doctor_id !== user.id) {
      return res.status(403).json({ error: 'No tienes permiso para actualizar este item' });
    }

    // Obtener item actual
    const { data: item, error: itemError } = await supabase
      .from('presupuesto_items')
      .select('*')
      .eq('id', item_id)
      .eq('presupuesto_id', id)
      .single();

    if (itemError || !item) {
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    // Actualizar estado del item
    const { data: itemActualizado, error: updateError } = await supabase
      .from('presupuesto_items')
      .update({ estado })
      .eq('id', item_id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Obtener todos los items del presupuesto
    const { data: todosItems } = await supabase
      .from('presupuesto_items')
      .select('*')
      .eq('presupuesto_id', id);

    // Recalcular total: suma de subtotales de items no cancelados
    let nuevoTotal = 0;
    (todosItems || []).forEach((it) => {
      if (it.id === item_id) {
        // Usar el estado actualizado
        if (it.estado !== 'cancelado') {
          nuevoTotal += it.subtotal;
        }
      } else {
        // Usar el estado actual
        if (it.estado !== 'cancelado') {
          nuevoTotal += it.subtotal;
        }
      }
    });

    // Aplicar descuento global al nuevo total
    const totalConDescuento = nuevoTotal * (1 - presupuesto.descuento_global / 100);

    // Actualizar total del presupuesto
    const { data: presupuestoActualizado, error: presupuestoUpdateError } = await supabase
      .from('presupuestos')
      .update({ total: totalConDescuento })
      .eq('id', id)
      .select()
      .single();

    if (presupuestoUpdateError) {
      return res.status(500).json({ error: presupuestoUpdateError.message });
    }

    res.json({
      ...presupuestoActualizado,
      items: todosItems || []
    });
  } catch (err) {
    console.error('Error en PATCH presupuestos/:id/items/:item_id:', err);
    res.status(500).json({ error: 'Error al actualizar item' });
  }
});

// DELETE /api/v1/presupuestos/:id
// Soft delete: cambiar estado a rechazado
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Obtener presupuesto
    const { data: presupuesto, error: getError } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('id', id)
      .single();

    if (getError || !presupuesto) {
      return res.status(404).json({ error: 'Presupuesto no encontrado' });
    }

    // Validar permisos: solo admin o doctor propietario
    if (user.role === 'doctor' && presupuesto.doctor_id !== user.id) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este presupuesto' });
    }

    // Soft delete: cambiar estado a rechazado
    const { data: eliminado, error: deleteError } = await supabase
      .from('presupuestos')
      .update({ estado: 'rechazado' })
      .eq('id', id)
      .select()
      .single();

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    res.json({
      message: 'Presupuesto eliminado (soft delete)',
      presupuesto: eliminado
    });
  } catch (err) {
    console.error('Error en DELETE presupuestos/:id:', err);
    res.status(500).json({ error: 'Error al eliminar presupuesto' });
  }
});

module.exports = router;
