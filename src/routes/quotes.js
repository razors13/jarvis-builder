// src/routes/quotes.js
// JARVIS OS - Modulo Clinica: Presupuestos Odontologicos
// FASE 1: Storage en memoria. Migracion a Supabase en Semana 2.

const express = require('express');
const router = express.Router();

// ---------------------------------------------------------------------------
// IN-MEMORY STORE
// ---------------------------------------------------------------------------
let quotes = [];
let nextId = 1;

// ---------------------------------------------------------------------------
// ARANCEL ODONTOLOGICO BASE
// Precios en CLP. Ajustables via PATCH /api/v1/presupuestos/arancel
// Como un precio de entrada al mercado: referencial, negociable por caso.
// ---------------------------------------------------------------------------
let ARANCEL = {
  consulta_general:   { nombre: 'Consulta general',         precio: 15000  },
  limpieza:           { nombre: 'Limpieza dental',           precio: 25000  },
  extraccion_simple:  { nombre: 'Extraccion simple',         precio: 35000  },
  extraccion_molar:   { nombre: 'Extraccion molar/cordal',   precio: 80000  },
  endodoncia_anterior:{ nombre: 'Endodoncia diente anterior',precio: 120000 },
  endodoncia_molar:   { nombre: 'Endodoncia molar',          precio: 180000 },
  obturacion_resina:  { nombre: 'Obturacion resina',         precio: 30000  },
  corona_ceramica:    { nombre: 'Corona ceramica',           precio: 250000 },
  implante:           { nombre: 'Implante oseointegrado',    precio: 600000 },
  ortodoncia_mensual: { nombre: 'Ortodoncia (mensualidad)',  precio: 80000  },
  blanqueamiento:     { nombre: 'Blanqueamiento dental',     precio: 120000 },
  radiografia:        { nombre: 'Radiografia periapical',    precio: 8000   },
  radiografia_panoramica:{ nombre:'Radiografia panoramica',  precio: 25000  },
  protesis_total:     { nombre: 'Protesis total',            precio: 350000 },
  protesis_parcial:   { nombre: 'Protesis parcial',          precio: 200000 },
};

// ---------------------------------------------------------------------------
// CONSTANTES
// ---------------------------------------------------------------------------
const VALID_ESTADOS = ['borrador', 'enviado', 'aceptado', 'rechazado', 'vencido'];
const VALID_PREVISIONES = ['FONASA', 'Isapre', 'Particular', 'Otro'];
const DIAS_VIGENCIA_DEFAULT = 30;

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------
function calcularTotales(items, descuento_porcentaje = 0) {
  const subtotal = items.reduce((sum, item) => {
    return sum + (item.precio_unitario * item.cantidad);
  }, 0);
  const descuento_monto = Math.round(subtotal * (descuento_porcentaje / 100));
  const total = subtotal - descuento_monto;
  return { subtotal, descuento_monto, total };
}

function calcularVencimiento(dias = DIAS_VIGENCIA_DEFAULT) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
}

function verificarVencidos() {
  const ahora = new Date();
  quotes.forEach((q, i) => {
    if (q.estado === 'enviado' && new Date(q.fecha_vencimiento) < ahora) {
      quotes[i].estado = 'vencido';
      quotes[i].updated_at = new Date();
    }
  });
}

// ---------------------------------------------------------------------------
// VALIDACION DE ITEMS
// ---------------------------------------------------------------------------
function validateItems(items) {
  const errors = [];
  if (!Array.isArray(items) || items.length === 0) {
    return ['items: debe ser un array con al menos un tratamiento'];
  }
  items.forEach((item, idx) => {
    if (!item.codigo || !ARANCEL[item.codigo]) {
      errors.push(`items[${idx}].codigo: invalido o no existe en arancel`);
    }
    const cant = parseInt(item.cantidad);
    if (isNaN(cant) || cant < 1 || cant > 99) {
      errors.push(`items[${idx}].cantidad: debe ser entre 1 y 99`);
    }
    // precio_unitario opcional: si no viene, se usa el del arancel
  });
  return errors;
}

function validateQuote(data, requireAll = true) {
  const errors = [];

  if (requireAll || data.paciente_id !== undefined) {
    const pid = parseInt(data.paciente_id);
    if (!data.paciente_id || isNaN(pid) || pid < 1) {
      errors.push('paciente_id: requerido');
    }
  }

  if (requireAll || data.items !== undefined) {
    const itemErrors = validateItems(data.items || []);
    errors.push(...itemErrors);
  }

  if (data.descuento_porcentaje !== undefined) {
    const d = parseFloat(data.descuento_porcentaje);
    if (isNaN(d) || d < 0 || d > 100) {
      errors.push('descuento_porcentaje: debe ser entre 0 y 100');
    }
  }

  if (data.prevision !== undefined) {
    if (!VALID_PREVISIONES.includes(data.prevision)) {
      errors.push(`prevision: debe ser uno de [${VALID_PREVISIONES.join(', ')}]`);
    }
  }

  if (data.estado !== undefined) {
    if (!VALID_ESTADOS.includes(data.estado)) {
      errors.push(`estado: debe ser uno de [${VALID_ESTADOS.join(', ')}]`);
    }
  }

  if (data.dias_vigencia !== undefined) {
    const d = parseInt(data.dias_vigencia);
    if (isNaN(d) || d < 1 || d > 365) {
      errors.push('dias_vigencia: debe ser entre 1 y 365');
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// GET /api/v1/presupuestos/arancel
// Consultar precios base del arancel
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
// Actualizar precio de un tratamiento en el arancel
// ---------------------------------------------------------------------------
router.patch('/arancel/:codigo', (req, res) => {
  const { codigo } = req.params;
  if (!ARANCEL[codigo]) {
    return res.status(404).json({ error: `Tratamiento '${codigo}' no existe en el arancel` });
  }
  const precio = parseInt(req.body.precio);
  if (isNaN(precio) || precio < 0) {
    return res.status(400).json({ error: 'precio: debe ser un numero positivo en CLP' });
  }
  ARANCEL[codigo].precio = precio;
  res.json({
    message: `Precio actualizado`,
    tratamiento: { codigo, ...ARANCEL[codigo] }
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/presupuestos
// Filtros: ?paciente_id=1 &estado=enviado
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  verificarVencidos();
  let result = [...quotes];

  if (req.query.paciente_id) {
    const pid = parseInt(req.query.paciente_id);
    if (isNaN(pid)) return res.status(400).json({ error: 'paciente_id invalido' });
    result = result.filter(q => q.paciente_id === pid);
  }

  if (req.query.estado) {
    if (!VALID_ESTADOS.includes(req.query.estado)) {
      return res.status(400).json({ error: `estado invalido. Valores: ${VALID_ESTADOS.join(', ')}` });
    }
    result = result.filter(q => q.estado === req.query.estado);
  }

  result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  res.json({ total: result.length, presupuestos: result });
});

// ---------------------------------------------------------------------------
// GET /api/v1/presupuestos/:id
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  verificarVencidos();
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

  const quote = quotes.find(q => q.id === id);
  if (!quote) return res.status(404).json({ error: `Presupuesto ${id} no encontrado` });

  res.json(quote);
});

// ---------------------------------------------------------------------------
// POST /api/v1/presupuestos
// Crear presupuesto con items del arancel
// Body: {
//   paciente_id, items: [{codigo, cantidad, precio_unitario?}],
//   descuento_porcentaje?, prevision?, notas?, dias_vigencia?
// }
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const errors = validateQuote(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos invalidos', detalles: errors });
  }

  // Construir items con precios del arancel (o precio custom si viene)
  const items = req.body.items.map(item => {
    const arancelItem = ARANCEL[item.codigo];
    const precioUnitario = item.precio_unitario
      ? parseInt(item.precio_unitario)
      : arancelItem.precio;
    const cantidad = parseInt(item.cantidad);
    return {
      codigo: item.codigo,
      nombre: arancelItem.nombre,
      cantidad,
      precio_unitario: precioUnitario,
      subtotal: precioUnitario * cantidad
    };
  });

  const descuento = parseFloat(req.body.descuento_porcentaje) || 0;
  const { subtotal, descuento_monto, total } = calcularTotales(items, descuento);
  const diasVigencia = parseInt(req.body.dias_vigencia) || DIAS_VIGENCIA_DEFAULT;

  const nuevoPresupuesto = {
    id: nextId++,
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
    fecha_vencimiento: calcularVencimiento(diasVigencia).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  quotes.push(nuevoPresupuesto);

  res.status(201).json({
    message: 'Presupuesto creado exitosamente',
    presupuesto: nuevoPresupuesto
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/presupuestos/:id
// Actualizar estado, notas, descuento
// Transiciones validas:
//   borrador -> enviado
//   enviado  -> aceptado | rechazado
//   cualquiera -> vencido (automatico)
// ---------------------------------------------------------------------------
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

  const index = quotes.findIndex(q => q.id === id);
  if (index === -1) return res.status(404).json({ error: `Presupuesto ${id} no encontrado` });

  const quote = quotes[index];

  // Validar transicion de estado
  if (req.body.estado) {
    const transiciones = {
      borrador: ['enviado'],
      enviado:  ['aceptado', 'rechazado'],
      aceptado: [],
      rechazado:[],
      vencido:  []
    };
    const permitidas = transiciones[quote.estado] || [];
    if (!permitidas.includes(req.body.estado)) {
      return res.status(409).json({
        error: `Transicion invalida: '${quote.estado}' -> '${req.body.estado}'`,
        transiciones_permitidas: permitidas.length
          ? permitidas
          : ['Este presupuesto no puede cambiar de estado']
      });
    }
  }

  // Recalcular totales si cambia descuento
  let totalesActualizados = {};
  if (req.body.descuento_porcentaje !== undefined) {
    const descuento = parseFloat(req.body.descuento_porcentaje);
    if (isNaN(descuento) || descuento < 0 || descuento > 100) {
      return res.status(400).json({ error: 'descuento_porcentaje: debe ser entre 0 y 100' });
    }
    totalesActualizados = calcularTotales(quote.items, descuento);
    totalesActualizados.descuento_porcentaje = descuento;
  }

  quotes[index] = {
    ...quote,
    ...(req.body.estado    && { estado: req.body.estado }),
    ...(req.body.notas     && { notas: req.body.notas.trim() }),
    ...totalesActualizados,
    updated_at: new Date().toISOString()
  };

  res.json({
    message: 'Presupuesto actualizado',
    presupuesto: quotes[index]
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/presupuestos/:id
// Solo borradores pueden eliminarse. Aceptados/rechazados = historial.
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalido' });

  const index = quotes.findIndex(q => q.id === id);
  if (index === -1) return res.status(404).json({ error: `Presupuesto ${id} no encontrado` });

  if (quotes[index].estado !== 'borrador') {
    return res.status(409).json({
      error: `Solo se pueden eliminar presupuestos en borrador`,
      estado_actual: quotes[index].estado
    });
  }

  quotes.splice(index, 1);
  res.json({ message: `Presupuesto ${id} eliminado` });
});

module.exports = router;