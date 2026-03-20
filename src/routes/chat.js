// src/routes/chat.js
// JARVIS OS - Router Inteligente Central
// Recibe mensaje en lenguaje natural, clasifica la intencion,
// ejecuta la accion correspondiente y responde como Jarvis.
// Como un smart order router: analiza el input y lo envia
// al modulo correcto sin que el usuario sepa que existe.

const express = require('express');
const router = express.Router();
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Jarvis OS'
  }
});

const MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

// ---------------------------------------------------------------------------
// CONTEXTO DEL SISTEMA
// Lo que Jarvis sabe sobre el negocio. Expandir con datos reales.
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `Eres Jarvis, el asistente inteligente de una empresa que tiene dos negocios:

1. CLINICA ODONTOLOGICA: Atiende pacientes dentales. Maneja fichas de pacientes, 
   citas dentales y presupuestos de tratamientos.

2. EMPRESA DE IMPRESION 3D: Fabrica souvenirs y productos personalizados para 
   empresas mineras. Analiza imagenes de productos, genera cotizaciones 3D,
   y maneja pedidos.

Tu trabajo es:
- Entender lo que necesita el usuario en lenguaje natural
- Clasificar si es una tarea de CLINICA o EMPRESA
- Identificar la accion especifica que se necesita
- Responder de forma util, directa y profesional en espanol

IMPORTANTE: Responde SOLO en JSON valido con esta estructura exacta:
{
  "modulo": "clinica" | "empresa" | "general",
  "accion": "string",
  "parametros": {},
  "respuesta_usuario": "string",
  "requiere_datos_adicionales": boolean,
  "datos_faltantes": ["string"]
}

Acciones disponibles:
CLINICA:
- crear_paciente: registrar nuevo paciente
- buscar_paciente: buscar por nombre o RUT
- crear_cita: agendar cita dental
- ver_citas: consultar citas de un paciente o fecha
- disponibilidad: ver horarios disponibles
- crear_presupuesto: generar presupuesto de tratamiento
- ver_presupuesto: consultar presupuesto existente

EMPRESA:
- analizar_imagen: analizar imagen de producto (requiere imagen)
- cotizar_producto: generar cotizacion de impresion 3D
- ver_pedido: consultar estado de pedido
- crear_pedido: registrar nuevo pedido

GENERAL:
- consulta_general: pregunta que no requiere accion especifica
- ayuda: explicar que puede hacer Jarvis`;

// ---------------------------------------------------------------------------
// HISTORIAL DE CONVERSACION (en memoria por sesion)
// En produccion: persistir en Supabase por session_id
// ---------------------------------------------------------------------------
const conversaciones = new Map();
const MAX_HISTORIAL = 10; // ultimos 10 turnos por sesion

function getHistorial(sessionId) {
  if (!conversaciones.has(sessionId)) {
    conversaciones.set(sessionId, []);
  }
  return conversaciones.get(sessionId);
}

function agregarAlHistorial(sessionId, role, content) {
  const historial = getHistorial(sessionId);
  historial.push({ role, content });
  // Mantener solo los ultimos N turnos para no explotar el contexto
  if (historial.length > MAX_HISTORIAL * 2) {
    historial.splice(0, 2); // elimina el turno mas antiguo
  }
}

// ---------------------------------------------------------------------------
// EJECUTORES DE ACCIONES
// Conectan la intencion clasificada con los modulos reales
// ---------------------------------------------------------------------------
async function ejecutarAccion(clasificacion, req) {
  const { modulo, accion, parametros } = clasificacion;

  // Importar datos en memoria de los otros modulos
  // En produccion esto sera queries a Supabase
  // Por ahora usamos require para acceder a los routers
  // y ejecutamos logica directamente

  switch (`${modulo}.${accion}`) {

    case 'clinica.disponibilidad': {
      const fecha = parametros.fecha || new Date().toISOString().substring(0, 10);
      const tratamiento = parametros.tratamiento || 'consulta_general';
      return {
        tipo: 'disponibilidad',
        url_sugerida: `GET /api/v1/citas/disponibilidad?fecha=${fecha}&tratamiento=${tratamiento}`,
        mensaje: `Para ver disponibilidad usa: GET /api/v1/citas/disponibilidad?fecha=${fecha}&tratamiento=${tratamiento}`
      };
    }

    case 'clinica.crear_cita':
    case 'clinica.crear_paciente':
    case 'clinica.crear_presupuesto':
    case 'empresa.crear_pedido': {
      const endpointMap = {
        'clinica.crear_cita':        'POST /api/v1/citas',
        'clinica.crear_paciente':    'POST /api/v1/pacientes',
        'clinica.crear_presupuesto': 'POST /api/v1/presupuestos',
        'empresa.crear_pedido':      'POST /api/v1/pedidos'
      };
      return {
        tipo: 'accion_requerida',
        endpoint: endpointMap[`${modulo}.${accion}`],
        parametros_sugeridos: parametros,
        mensaje: `Accion lista para ejecutar`
      };
    }

    default:
      return { tipo: 'informativo', mensaje: clasificacion.respuesta_usuario };
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/chat
// Body: { mensaje: string, session_id?: string }
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { mensaje, session_id } = req.body;

    if (!mensaje || typeof mensaje !== 'string' || mensaje.trim().length === 0) {
      return res.status(400).json({ error: 'mensaje: requerido y no puede estar vacio' });
    }

    if (mensaje.trim().length > 1000) {
      return res.status(400).json({ error: 'mensaje: maximo 1000 caracteres' });
    }

    // Session ID para mantener contexto de conversacion
    const sessionId = session_id || `anon_${Date.now()}`;

    // Agregar mensaje del usuario al historial
    agregarAlHistorial(sessionId, 'user', mensaje.trim());

    // Construir messages con historial para contexto
    const historial = getHistorial(sessionId);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historial.slice(-MAX_HISTORIAL * 2) // ultimos N turnos
    ];

    // Llamar al LLM para clasificar la intencion
    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.1, // bajo para clasificacion consistente
      max_tokens: 500,
      messages
    });

    const rawContent = response?.choices?.[0]?.message?.content || '';

    // Limpiar y parsear JSON
    const cleaned = rawContent
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    let clasificacion;
    try {
      clasificacion = JSON.parse(cleaned);
    } catch {
      // Si el LLM no devuelve JSON valido, respuesta de fallback
      return res.json({
        session_id: sessionId,
        modulo: 'general',
        accion: 'consulta_general',
        respuesta: rawContent,
        datos_adicionales: null
      });
    }

    // Agregar respuesta del asistente al historial
    agregarAlHistorial(sessionId, 'assistant', cleaned);

    // Ejecutar accion si corresponde
    const datosAdicionales = await ejecutarAccion(clasificacion, req);

    // Respuesta final al cliente
    res.json({
      session_id: sessionId,
      modulo: clasificacion.modulo,
      accion: clasificacion.accion,
      respuesta: clasificacion.respuesta_usuario,
      requiere_datos_adicionales: clasificacion.requiere_datos_adicionales || false,
      datos_faltantes: clasificacion.datos_faltantes || [],
      datos_adicionales: datosAdicionales,
      parametros_detectados: clasificacion.parametros || {}
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Error procesando mensaje',
      details: error?.message || 'Unknown error'
    });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/chat/sesion/:session_id
// Limpiar historial de una sesion
// ---------------------------------------------------------------------------
router.delete('/sesion/:session_id', (req, res) => {
  const { session_id } = req.params;
  if (conversaciones.has(session_id)) {
    conversaciones.delete(session_id);
    res.json({ message: `Sesion ${session_id} eliminada` });
  } else {
    res.status(404).json({ error: 'Sesion no encontrada' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/chat/sesion/:session_id
// Ver historial de una sesion
// ---------------------------------------------------------------------------
router.get('/sesion/:session_id', (req, res) => {
  const { session_id } = req.params;
  const historial = conversaciones.get(session_id) || [];
  res.json({
    session_id,
    turnos: historial.length / 2,
    historial
  });
});

module.exports = router;