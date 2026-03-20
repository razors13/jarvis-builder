// src/routes/quotes.js
// JARVIS OS — Modulo Clinica: Presupuestos Odontologicos
// MIGRADO A SUPABASE — datos persisten entre reinicios

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// ---------------------------------------------------------------------------
// ARANCEL BASE EN MEMORIA
// Los precios se guardan aqui — en Semana 3 migran a tabla Supabase
// ---------------------------------------------------------------------------
let ARANCEL = {
  consulta_general:      { nombre: 'Consulta general',          precio: 15000  },
  limpieza:              { nombre: 'Limpieza dental',            precio: 25000  },
  extraccion_simple:     { nombre: 'Extraccion simple',          precio: 35000  },
  extraccion_molar:      { nombre: 'Extraccion molar/cordal',    precio: 80000  },
  endodoncia_anterior:   { nombre: 'Endodoncia anterior',        precio: 120000 },
  endodoncia_molar:      { nombre: 'Endodoncia molar',           precio: 180000 },
  obturacion_resina:     { nombre: 'Obturacion resina',          precio: 30000  },
  corona_ceramica:       { nombre: 'Corona ceramica',            precio: 250000 },
  implante:              { nombre: 'Implante oseointegrado',     precio: 600000 },
  ortodoncia_mensual:    { nombre: 'Ortodoncia mensualidad',     precio: 80000  },
  blanqueamiento:        { nombre: 'Blanqueamiento dental',      precio: 120000 },
  radiografia:           { nombre: 'Radiografia periapical',     precio: 8000   },
  radiografia_panoramica:{ nombre: 'Radiografia panoramica',     precio: 25000  },
  protesis_total:        { nombre: 'Protesis total',             precio: 350000 },
  protesis_parcial:      { nombre: 'Protesis parcial',           precio: 200000 },
};

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------
const VALID_ESTADOS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido'];
const VALID_PREVISIONES = ['FONASA', 'Isapre', 'Particular', 'Otro'];
const DIAS_VIGENCIA_DEFAULT = 30;

const TRANSICIONES = {
  borrador:  ['enviado'],
  enviado:   ['aceptado', 'rechazado'],
  aceptado:  [],
  rechazado: [],
  vencido:   []
};

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------
function calcularTotales(items, descuento_porcentaje = 0) {
  const subtotal = items.reduce((sum, i) => sum + (i.precio_unitario * i.cantidad), 0);
  const descuento_monto = Math.round(subtotal * (descuento_porcentaje / 100));
  return { subtotal, descuento_monto, total: subtotal - descuento_monto };
}

function calcularVencimiento(dias = DIAS_VIGENCIA_DEFAULT) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return ['items: debe ser un array con al menos un tratamiento'];
  }
  const errors = [];
  items.forEach((item, idx) => {
    if (!item.codigo || !ARANCEL[item.codigo]) {
      errors.push(`items[${idx}].codigo: invalido o no existe en arancel`);
    }
    const cant = parseInt(item.cantidad);
    if (isNaN(cant) || cant < 1 || cant > 99) {
      errors.push(`items[${idx}].cantidad: debe ser entre 1 y 99`);
    }
  });
  return errors;
}

function validateQuote(data, requireAll = true) {
  const errors = [];

  if (requireAll || data.paciente_id !== undefined) {
    if (!data.paciente_id || isNaN(parseInt(data.paciente_id))) {
      errors.push('paciente_id: requerido');
    }
  }

  if (requireAll || data.items !== undefined) {
    errors.push(...validateItems(data.items || []));
  }

  if (data.descuento_porcentaje !== undefined) {
    const d = parseFloat(data.descuento_porcentaje);
    if (isNaN(d) || d < 0 || d > 100) {
      errors.push('descuento_porcentaje: debe ser entre 0 y 100');
    }
  }

  if (data.prevision !== undefined && !VALID_PREVISIONES.includes(data.prevision)) {
    errors.push(`prevision: debe ser uno de [${VALID_PREVISIONES.join(', ')}]`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// GET /api/v1/presupuestos/arancel
// ---------------------------------------------------------------------------
router.get('/arancel', (req, res) => {
  const lista = Object.entries(ARANCEL).map(([codigo, data]) => ({
    codigo,
    nombre: data.nombre,
    precio: data.precio,
    precio_formateado: `$${data.precio.toLocaleString('es-CL')}`
  }));
  res.json({ total_items: lista.length, arancel: lista });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/presupuestos/arancel/:codigo
// ---------------------------------------------------------------------------
router.patch('/arancel/:codigo', (req, res) => {
  const { codigo } = req.params;
  if (!ARANCEL[codigo]) {
    return res.status(404).json({ error: `Tratamiento '${codigo}' no existe` });
  }
  const precio = parseInt(req.body.precio);
  if (isNaN(precio) || precio < 0) {
    return res.status(400).json({ error: 'precio: debe ser numero positivo en CLP' });
  }
  ARANCEL[codigo].precio = precio;
  res.json({ message: 'Precio actualizado', tratamiento: { codigo, ...ARANCEL[codigo] } });
});

// ---------------------------------------------------------------------------
// GET /api/v1/presupuestos
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  try {
    let query = supabase
      .from('presupuestos')
      .select('*')
      .order('created_at', { ascending: false });

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

    const { data, error } = await query;
    if (error) throw error;

    // Marcar vencidos automaticamente
    const ahora = new Date();
    const vencidos = data.filter(q =>
      q.estado === 'enviado' && new Date(q.fecha_vencimiento) < ahora
    );

    if (vencidos.length > 0) {
      const ids = vencidos.map(q => q.id);
      await supabase
        .from('presupuestos')
        .update({ estado: 'vencido', updated_at: ahora.toISOString() })
        .in('id', ids);
      vencidos.forEach(q => { q.estado = 'vencido'; });
    }

    res.json({ total: data.length, presupuestos: data });

  } catch (error) {
    console.error('GET /presupuestos error:', error);
    res.status(500).json({ error: 'Error al obtener presupuestos', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/presupuestos/:id
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data, error } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: `Presupuesto ${id} no encontrado` });
      }
      throw error;
    }

    res.json(data);

  } catch (error) {
    console.error('GET /presupuestos/:id error:', error);
    res.status(500).json({ error: 'Error al obtener presupuesto', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/presupuestos
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const errors = validateQuote(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
    }

    const items = req.body.items.map(item => {
      const arancelItem = ARANCEL[item.codigo];
      const precio_unitario = item.precio_unitario
        ? parseInt(item.precio_unitario)
        : arancelItem.precio;
      const cantidad = parseInt(item.cantidad);
      return {
        codigo: item.codigo,
        nombre: arancelItem.nombre,
        cantidad,
        precio_unitario,
        subtotal: precio_unitario * cantidad
      };
    });

    const descuento = parseFloat(req.body.descuento_porcentaje) || 0;
    const { subtotal, descuento_monto, total } = calcularTotales(items, descuento);
    const diasVigencia = parseInt(req.body.dias_vigencia) || DIAS_VIGENCIA_DEFAULT;

    const { data, error } = await supabase
      .from('presupuestos')
      .insert({
        paciente_id: parseInt(req.body.paciente_id),
        estado: 'borrador',
        prevision: req.body.prevision || 'Particular',
        items,
        descuento_porcentaje: descuento,
        descuento_monto,
        subtotal,
        total,
        notas: req.body.notas?.trim() || null,
        dias_vigencia: diasVigencia,
        fecha_vencimiento: calcularVencimiento(diasVigencia)
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'Presupuesto creado exitosamente', presupuesto: data });

  } catch (error) {
    console.error('POST /presupuestos error:', error);
    res.status(500).json({ error: 'Error al crear presupuesto', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/presupuestos/:id
// ---------------------------------------------------------------------------
router.patch('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data: quote, error: fetchError } = await supabase
      .from('presupuestos')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !quote) {
      return res.status(404).json({ error: `Presupuesto ${id} no encontrado` });
    }

    if (req.body.estado) {
      const permitidas = TRANSICIONES[quote.estado] || [];
      if (!permitidas.includes(req.body.estado)) {
        return res.status(409).json({
          error: `Transicion invalida: '${quote.estado}' -> '${req.body.estado}'`,
          transiciones_permitidas: permitidas.length ? permitidas : ['Estado final, no puede cambiar']
        });
      }
    }

    let totalesActualizados = {};
    if (req.body.descuento_porcentaje !== undefined) {
      const descuento = parseFloat(req.body.descuento_porcentaje);
      if (isNaN(descuento) || descuento < 0 || descuento > 100) {
        return res.status(400).json({ error: 'descuento_porcentaje: entre 0 y 100' });
      }
      totalesActualizados = {
        ...calcularTotales(quote.items, descuento),
        descuento_porcentaje: descuento
      };
    }

    const updates = {
      ...(req.body.estado && { estado: req.body.estado }),
      ...(req.body.notas  && { notas: req.body.notas.trim() }),
      ...totalesActualizados,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('presupuestos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ message: 'Presupuesto actualizado', presupuesto: data });

  } catch (error) {
    console.error('PATCH /presupuestos/:id error:', error);
    res.status(500).json({ error: 'Error al actualizar presupuesto', details: error.message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/presupuestos/:id — solo borradores
// ---------------------------------------------------------------------------
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

    const { data: quote } = await supabase
      .from('presupuestos')
      .select('estado')
      .eq('id', id)
      .single();

    if (!quote) return res.status(404).json({ error: `Presupuesto ${id} no encontrado` });

    if (quote.estado !== 'borrador') {
      return res.status(409).json({
        error: 'Solo se pueden eliminar presupuestos en borrador',
        estado_actual: quote.estado
      });
    }

    const { error } = await supabase
      .from('presupuestos')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: `Presupuesto ${id} eliminado` });

  } catch (error) {
    console.error('DELETE /presupuestos/:id error:', error);
    res.status(500).json({ error: 'Error al eliminar presupuesto', details: error.message });
  }
});

module.exports = router;