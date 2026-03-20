// src/routes/orders.js
// JARVIS OS — Modulo ThinkOf: Pedidos de Impresión 3D para Minería
// MIGRADO A SUPABASE — datos persisten entre reinicios

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------
const VALID_ESTADOS = ['nuevo', 'cotizado', 'aprobado', 'produccion', 'entregado', 'cancelado'];

// ---------------------------------------------------------------------------
// VALIDACION
// ---------------------------------------------------------------------------
function validateOrder(data, requireAll = true) {
  const errors = [];

  if (requireAll || data.empresa !== undefined) {
    if (!data.empresa || typeof data.empresa !== 'string' || data.empresa.trim().length < 2) {
      errors.push('empresa: requerido, minimo 2 caracteres');
    }
  }

  if (data.contacto !== undefined && data.contacto !== null) {
    if (typeof data.contacto !== 'string' || data.contacto.trim().length < 2) {
      errors.push('contacto: minimo 2 caracteres');
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

  if (requireAll || data.producto !== undefined) {
    if (!data.producto || typeof data.producto !== 'string' || data.producto.trim().length < 2) {
      errors.push('producto: requerido, minimo 2 caracteres');
    }
  }

  if (requireAll || data.descripcion !== undefined) {
    if (!data.descripcion || typeof data.descripcion !== 'string' || data.descripcion.trim().length < 5) {
      errors.push('descripcion: requerido, minimo 5 caracteres');
    }
  }

  if (requireAll || data.cantidad !== undefined) {
    const cant = parseInt(data.cantidad);
    if (isNaN(cant) || cant < 1 || cant > 999) {
      errors.push('cantidad: debe ser entre 1 y 999');
    }
  }

  if (data.material !== undefined && data.material !== null) {
    if (typeof data.material !== 'string' || data.material.trim().length < 2) {
      errors.push('material: minimo 2 caracteres');
    }
  }

  if (data.acabado !== undefined && data.acabado !== null) {
    if (typeof data.acabado !== 'string' || data.acabado.trim().length < 2) {
      errors.push('acabado: minimo 2 caracteres');
    }
  }

  if (data.archivo_url !== undefined && data.archivo_url !== null) {
    if (typeof data.archivo_url !== 'string' || !/^https?:\/\/.+/.test(data.archivo_url)) {
      errors.push('archivo_url: debe ser una URL válida');
    }
  }

  if (data.precio_estimado !== undefined) {
    const precio = parseFloat(data.precio_estimado);
    if (isNaN(precio) || precio < 0 || precio > 999999999) {
      errors.push('precio_estimado: debe ser un número entre 0 y 999.999.999');
    }
  }

  if (data.precio_final !== undefined) {
    const precio = parseFloat(data.precio_final);
    if (isNaN(precio) || precio < 0 || precio > 999999999) {
      errors.push('precio_final: debe ser un número entre 0 y 999.999.999');
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
// GET /api/v1/pedidos
// Filtros: ?estado=nuevo &empresa=minaX
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('pedidos')
      .select('*')
      .order('created_at', { ascending: false });

    if (req.query.estado) {
      if (!VALID_ESTADOS.includes(req.query.estado)) {
        return res.status(400).json({ error: `estado invalido. Valores: ${VALID_ESTADOS.join(', ')}` });
      }
      query = query.eq('estado', req.query.estado);
    }

    if (req.query.empresa) {
      query = query.eq('empresa', req.query.empresa.trim());
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ total: data.length, pedidos: data });

  } catch (error) {
    console.error('GET /pedidos error:', error);
    res.status(500).json({ error: 'Error al obtener pedidos', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/pedidos/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Pedido ${id} no encontrado` });
      }
      throw error;
    }

    res.json(data);

  } catch (error) {
    console.error('GET /pedidos/:id error:', error);
    res.status(500).json({ error: 'Error al obtener pedido', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/pedidos
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const errors = validateOrder(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
    }

    const { data, error } = await supabase
      .from('pedidos')
      .insert({
        empresa: req.body.empresa.trim(),
        contacto: req.body.contacto?.trim() || null,
        telefono: req.body.telefono?.trim() || null,
        email: req.body.email?.trim().toLowerCase() || null,
        producto: req.body.producto.trim(),
        descripcion: req.body.descripcion.trim(),
        cantidad: parseInt(req.body.cantidad),
        material: req.body.material?.trim() || null,
        acabado: req.body.acabado?.trim() || null,
        archivo_url: req.body.archivo_url?.trim() || null,
        precio_estimado: parseFloat(req.body.precio_estimado) || null,
        precio_final: parseFloat(req.body.precio_final) || null,
        estado: 'nuevo',
        notas: req.body.notas?.trim() || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Pedido registrado exitosamente',
      pedido: data
    });

  } catch (error) {
    console.error('POST /pedidos error:', error);
    res.status(500).json({ error: 'Error al crear pedido', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/pedidos/:id
// Actualizacion parcial
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const errors = validateOrder(req.body, false);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
    }

    const { id: _id, created_at, ...updates } = req.body;

    const { data, error } = await supabase
      .from('pedidos')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Pedido ${id} no encontrado` });
      }
      throw error;
    }

    res.json({ message: 'Pedido actualizado', pedido: data });

  } catch (error) {
    console.error('PATCH /pedidos/:id error:', error);
    res.status(500).json({ error: 'Error al actualizar pedido', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/pedidos/:id
// Solo si estado es 'nuevo'
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data: pedido } = await supabase
      .from('pedidos')
      .select('estado')
      .eq('id', id)
      .single();

    if (!pedido) {
      return res.status(404).json({ error: `Pedido ${id} no encontrado` });
    }

    if (pedido.estado !== 'nuevo') {
      return res.status(409).json({
        error: 'Solo se pueden eliminar pedidos en estado "nuevo"',
        estado_actual: pedido.estado
      });
    }

    const { error } = await supabase
      .from('pedidos')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: `Pedido ${id} eliminado` });

  } catch (error) {
    console.error('DELETE /pedidos/:id error:', error);
    res.status(500).json({ error: 'Error al eliminar pedido', details: error.message });
  }
});

module.exports = router;