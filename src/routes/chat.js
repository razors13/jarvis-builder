// src/routes/chat.js
// JARVIS OS v2 - Compañero estratégico de Kevin Estay
// Multi-agente: DENT | BIZ | BUILDER | EXEC | STRATEGY

const express = require('express');
const router = express.Router();
const { chat: llmChat } = require('../lib/llm');

// ---------------------------------------------------------------------------
// DETECCION DE AGENTE
// ---------------------------------------------------------------------------
const AGENT_PATTERNS = {
  DENT: [/dent|diente|molar|incisal|estratif|resina|compos|kerr|palfique|3m|z350|endodo|corona|implant|clase\s?(i|ii|iii|iv|v)|esmalte|dentina|pulpa|carie|restaur|blanquea|ortod|protesis|radiograf|limpieza|extrac/i],
  BIZ:  [/thinkof|3d|impresi|souvenir|miner|cliente|precio|venta|producto|branding|merch|cotiz|pedido|negocio|empresa|b2b|marketing|logo|prototip/i],
  BUILDER: [/codigo|api|node|express|endpoint|supabase|deploy|bug|error|ruta|modulo|backend|frontend|base de datos|sql|json|servidor|npm|git|funcion|variable/i],
  EXEC: [/pasos|como hago|por donde|priorit|urgente|primero|checklist|plan|organiz|agenda|tiempo|rapido|ahora|hoy/i],
  STRATEGY: [/escal|futuro|vision|oportunidad|crecer|sistema|largo plazo|conectar|integrar|modelo de negocio|posicion|diferenci/i]
};

function detectarAgentes(mensaje) {
  const activos = [];
  for (const [agente, patterns] of Object.entries(AGENT_PATTERNS)) {
    if (patterns.some(p => p.test(mensaje))) activos.push(agente);
  }
  return activos.length > 0 ? activos : ['EXEC'];
}

// ---------------------------------------------------------------------------
// PROMPTS POR AGENTE
// ---------------------------------------------------------------------------
const AGENT_PROMPTS = {
  DENT: `Eres JARVIS DENT, el compañero clinico de Kevin Estay, odontologo estetico.
Kevin trabaja con: Kerr Harmonize, Palfique LX5, 3M Filtek Z350 XT.
Tecnica de estratificacion anatomica por capas.
Responde como colega al lado del sillon: diagnostico, plan, capas con espesores, tips, errores a evitar.`,

  BIZ: `Eres JARVIS BIZ, socio estrategico de ThinkOf.
ThinkOf: impresion 3D, souvenirs y merchandising para empresas mineras, branding corporativo B2B.
Target: empresas grandes del norte de Chile (mineria, construccion).
Responde: idea → cliente objetivo → precio → estrategia → bundle.`,

  BUILDER: `Eres JARVIS BUILDER, el CTO interno de Kevin.
Stack: Node.js + Express, OpenRouter/Anthropic, modulos: patients, appointments, quotes, describe, chat.
GitHub: razors13/jarvis-builder. Proximo: Supabase.
Responde: problema → solucion → codigo ejecutable → siguiente mejora.`,

  EXEC: `Eres JARVIS EXEC. Kevin no necesita motivacion, necesita claridad.
Responde siempre: Paso 1, Paso 2, Paso 3. Sin teoria. Sin relleno.`,

  STRATEGY: `Eres JARVIS STRATEGY.
Kevin tiene 3 negocios conectados: Clinica estetica + ThinkOf 3D + Jarvis OS (SaaS potencial).
Conectas puntos que parecen separados. Piensas en escala, no en tareas.`
};

function buildSystemPrompt(agentes) {
  const intro = `Eres JARVIS OS, sistema multi-agente de Kevin Estay.
Kevin: odontologo estetico, fundador de ThinkOf (3D para mineria), builder tecnologico.
Sistemas > tareas. Accion > teoria.

Reglas:
- Compañero estrategico, no asistente generico
- Directo, elegante, sin relleno
- Frases como: "Aqui esta la jugada", "Vamos a hacer esto simple", "Esto es lo importante"
- Al final de cada respuesta incluye:
  CHECKLIST (maximo 3 puntos clave)
  SIGUIENTE PASO (accion concreta e inmediata)

Agentes activos: ${agentes.join(' + ')}
`;
  return intro + '\n\n' + agentes.map(a => AGENT_PROMPTS[a]).join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// HISTORIAL POR SESION
// ---------------------------------------------------------------------------
const conversaciones = new Map();
const MAX_HISTORIAL = 20;

function getHistorial(sessionId) {
  if (!conversaciones.has(sessionId)) conversaciones.set(sessionId, []);
  return conversaciones.get(sessionId);
}

function agregarAlHistorial(sessionId, role, content) {
  const historial = getHistorial(sessionId);
  historial.push({ role, content });
  if (historial.length > MAX_HISTORIAL) historial.splice(0, 2);
}

// ---------------------------------------------------------------------------
// POST /api/v1/chat
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  try {
    const { mensaje, session_id } = req.body;

    if (!mensaje || typeof mensaje !== 'string' || !mensaje.trim()) {
      return res.status(400).json({ error: 'mensaje requerido' });
    }

    if (mensaje.trim().length > 2000) {
      return res.status(400).json({ error: 'mensaje: maximo 2000 caracteres' });
    }

    const sessionId = session_id || `kevin_${Date.now()}`;
    const mensajeLimpio = mensaje.trim();
    const agentes = detectarAgentes(mensajeLimpio);
    const systemPrompt = buildSystemPrompt(agentes);

    agregarAlHistorial(sessionId, 'user', mensajeLimpio);
    const historial = getHistorial(sessionId);

    const resultado = await llmChat({
      system: systemPrompt,
      messages: historial.slice(-MAX_HISTORIAL),
      maxTokens: 1000,
      temperature: 0.7
    });

    const respuesta = resultado.content;
    agregarAlHistorial(sessionId, 'assistant', respuesta);

    res.json({
      session_id: sessionId,
      agentes_activos: agentes,
      modelo: resultado.modelo,
      motor: resultado.motor,
      respuesta,
      turnos: Math.floor(historial.length / 2)
    });

  } catch (error) {
    console.error('Jarvis chat error:', error);
    res.status(500).json({
      error: 'Error en Jarvis OS',
      details: error?.message || 'Unknown error'
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/chat/status
// ---------------------------------------------------------------------------
router.get('/status', (req, res) => {
  const { USE_ANTHROPIC, CLAUDE_MODEL } = require('../lib/llm');
  res.json({
    status: 'online',
    motor: USE_ANTHROPIC ? 'anthropic' : 'openrouter',
    modelo: USE_ANTHROPIC ? CLAUDE_MODEL : (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'),
    claude_activo: USE_ANTHROPIC,
    sesiones_activas: conversaciones.size,
    agentes: Object.keys(AGENT_PATTERNS)
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/chat/sesion/:session_id
// DELETE /api/v1/chat/sesion/:session_id
// ---------------------------------------------------------------------------
router.get('/sesion/:session_id', (req, res) => {
  const historial = conversaciones.get(req.params.session_id) || [];
  res.json({
    session_id: req.params.session_id,
    turnos: Math.floor(historial.length / 2),
    historial
  });
});

router.delete('/sesion/:session_id', (req, res) => {
  conversaciones.delete(req.params.session_id);
  res.json({ message: 'Sesion eliminada' });
});

module.exports = router;