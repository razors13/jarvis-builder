// src/routes/chat.js
// JARVIS OS v2 — Multi-agente con ejecucion de acciones + voz

const express = require('express');
const router = express.Router();
const { chat: llmChat } = require('../lib/llm');
const supabase = require('../lib/supabase');

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

const ACTION_PATTERNS = [
  /registra|anota|guarda|crea|agrega|nueva evoluci[oó]n|nueva cita|nuevo paciente/i,
  /hice|realic[eé]|trat[eé]|pon|coloca|apunta/i
];

function detectarAgentes(mensaje) {
  const activos = [];
  for (const [agente, patterns] of Object.entries(AGENT_PATTERNS)) {
    if (patterns.some(p => p.test(mensaje))) activos.push(agente);
  }
  return activos.length > 0 ? activos : ['EXEC'];
}

function esAccionClinica(mensaje) {
  return ACTION_PATTERNS.some(p => p.test(mensaje));
}

// ---------------------------------------------------------------------------
// TONO PERSONALIZADO POR DOCTOR
// ---------------------------------------------------------------------------
function getSaludo(user) {
  if (!user) return 'Doctor';
  const esKevin = user.username === 'kevin' || user.role === 'admin' && user.username === 'kevin';
  if (esKevin) {
    const saludos = ['Sr. Stark', 'jefe', 'Kevin'];
    return saludos[Math.floor(Math.random() * saludos.length)];
  }
  const apellido = (user.nombre || '').split(' ').pop() || 'Doctor';
  return `Dr. ${apellido}`;
}

function esKevin(user) {
  return user?.username === 'kevin';
}

// ---------------------------------------------------------------------------
// PROMPTS POR AGENTE
// ---------------------------------------------------------------------------
const AGENT_PROMPTS = {
  DENT: `Eres JARVIS DENT, compañero clinico de odontologia estetica.
Materiales: Kerr Harmonize, Palfique LX5, 3M Filtek Z350 XT.
Tecnica de estratificacion anatomica por capas.
Responde como colega al lado del sillon: diagnostico, plan, capas con espesores, tips, errores a evitar.`,

  BIZ: `Eres JARVIS BIZ, socio estrategico de ThinkOf.
ThinkOf: impresion 3D, souvenirs y merchandising para empresas mineras, branding corporativo B2B.
Target: empresas grandes del norte de Chile (mineria, construccion).
Responde: idea → cliente objetivo → precio → estrategia → bundle.`,

  BUILDER: `Eres JARVIS BUILDER, CTO interno.
Stack: Node.js + Express, Anthropic Claude, Supabase. GitHub: razors13/jarvis-builder.
Responde: problema → solucion → codigo ejecutable → siguiente mejora.`,

  EXEC: `Eres JARVIS EXEC. Sin motivacion, solo claridad.
Responde siempre: Paso 1, Paso 2, Paso 3. Sin teoria. Sin relleno.`,

  STRATEGY: `Eres JARVIS STRATEGY.
3 negocios conectados: Clinica estetica + ThinkOf 3D + Jarvis OS (SaaS potencial).
Conectas puntos que parecen separados. Piensas en escala, no en tareas.`
};

function buildSystemPrompt(agentes, user) {
  const saludo = getSaludo(user);
  const esKev = esKevin(user);
  
  const tono = esKev
    ? `Tono: compañero estrategico de Kevin. Directo, con actitud, sin relleno.
Frases: "Aqui esta la jugada", "Vamos simple", "Esto es lo que importa".
Llama al usuario: ${saludo}`
    : `Tono: profesional, serio, clinico. Sin apodos ni humor.
Llama al usuario: ${saludo}`;

  const intro = `Eres JARVIS OS, sistema de gestion clinica.
${tono}

Reglas:
- Directo y util, sin relleno
- Al final incluye CHECKLIST (max 3 puntos) y SIGUIENTE PASO

Agentes activos: ${agentes.join(' + ')}
`;
  return intro + '\n\n' + agentes.map(a => AGENT_PROMPTS[a]).join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// PROMPT PARA EXTRACCION DE ACCIONES (Haiku — barato y preciso)
// ---------------------------------------------------------------------------
function getAccionPrompt() {
  return `Eres un extractor de datos clinicos. Tu unico trabajo es convertir texto medico informal a JSON estructurado.

El doctor habla en cualquier orden. Interpreta:
- Tratamiento: lo que hizo (endodoncia, limpieza, restauracion clase IV, etc)
- Dientes: numeros como 36, 11, 21 (sistema FDI)
- Materiales: Palfique, Harmonize, Z350, OptiBond, etc
- Anestesia: lidocaina, epinefrina, mepivacaina, sin anestesia, etc
- Cobro: 80=80000, 80k=80000, 80mil=80000, 120lucas=120000
- Notas: cualquier observacion adicional

Responde SOLO JSON valido:

Para EVOLUCION (tratamiento realizado):
{
  "accion": "crear_evolucion",
  "datos": {
    "tratamiento": "descripcion clara",
    "dientes_tratados": [36],
    "materiales": "string o null",
    "anestesia_tipo": "string o null",
    "notas": "string o null",
    "cobro": 80000
  }
}

Para CITA (agendar):
{
  "accion": "crear_cita",
  "datos": {
    "tratamiento": "tipo",
    "fecha_hora": "YYYY-MM-DDTHH:MM:00",
    "notas": "string o null"
  }
}

Si no puedes interpretar:
{
  "accion": "no_detectada",
  "mensaje": "razon especifica"
}

SOLO JSON. Sin markdown. Sin explicaciones.`;
}

// ---------------------------------------------------------------------------
// EJECUTAR ACCION CLINICA
// ---------------------------------------------------------------------------
async function ejecutarAccion(accionData, userId, pacienteId, user) {
  const { accion, datos } = accionData;
  const saludo = getSaludo(user);

  if (accion === 'crear_evolucion') {
    if (!pacienteId) {
      return { exito: false, mensaje: `${saludo}, necesito que abras la historia del paciente primero.` };
    }

    const { data: paciente } = await supabase
      .from('pacientes').select('id, nombre, odontograma').eq('id', pacienteId).single();

    if (!paciente) {
      return { exito: false, mensaje: `${saludo}, no encontré el paciente.` };
    }

    const { data: evolucion, error } = await supabase
      .from('evoluciones')
      .insert({
        paciente_id: paciente.id,
        tratamiento: datos.tratamiento,
        dientes_tratados: datos.dientes_tratados || [],
        materiales: datos.materiales || null,
        anestesia_tipo: datos.anestesia_tipo || null,
        notas: datos.notas || null,
        cobro: datos.cobro || 0,
        estado_pago: 'pendiente',
        snapshot_odontograma: paciente.odontograma || {}
      })
      .select().single();

    if (error) throw error;

    const lineas = [
      `✅ ${saludo}, evolución registrada para **${paciente.nombre}**`,
      ``,
      `• Tratamiento: ${datos.tratamiento}`,
      `• Dientes: ${(datos.dientes_tratados||[]).join(', ') || 'no especificados'}`,
      `• Materiales: ${datos.materiales || 'no especificados'}`,
      `• Anestesia: ${datos.anestesia_tipo || 'sin anestesia'}`,
      `• Cobro: $${(datos.cobro||0).toLocaleString('es-CL')}`,
      `• Estado: pendiente de pago`
    ];

    if (datos.notas) lineas.push(`• Notas: ${datos.notas}`);

    return {
      exito: true,
      mensaje: lineas.join('\n'),
      evolucion_id: evolucion.id,
      paciente: paciente.nombre
    };
  }

  if (accion === 'crear_cita') {
    if (!pacienteId) {
      return { exito: false, mensaje: `${saludo}, necesito que abras la historia del paciente primero.` };
    }

    const { data: paciente } = await supabase
      .from('pacientes').select('id, nombre').eq('id', pacienteId).single();

    if (!paciente) {
      return { exito: false, mensaje: `${saludo}, no encontré el paciente.` };
    }

    const { data: cita, error } = await supabase
      .from('citas')
      .insert({
        paciente_id: paciente.id,
        fecha_hora: datos.fecha_hora,
        tratamiento: datos.tratamiento,
        notas: datos.notas || null,
        estado: 'programada'
      })
      .select().single();

    if (error) throw error;

    return {
      exito: true,
      mensaje: `✅ ${saludo}, cita creada para **${paciente.nombre}**\n\n• Tratamiento: ${datos.tratamiento}\n• Fecha: ${new Date(datos.fecha_hora).toLocaleString('es-CL')}\n• Estado: programada`,
      cita_id: cita.id
    };
  }

  return { exito: false, mensaje: `${saludo}, acción no reconocida.` };
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
    const { mensaje, session_id, paciente_id } = req.body;

    if (!mensaje || typeof mensaje !== 'string' || !mensaje.trim())
      return res.status(400).json({ error: 'mensaje requerido' });

    if (mensaje.trim().length > 2000)
      return res.status(400).json({ error: 'mensaje: maximo 2000 caracteres' });

    const sessionId = session_id || `session_${Date.now()}`;
    const mensajeLimpio = mensaje.trim();
    const userId = req.user?.id;
    const user = req.user;

    // ── MODO ACCION ──────────────────────────────────────────────────────────
    if (esAccionClinica(mensajeLimpio)) {
      try {
        const extraccion = await llmChat({
          system: getAccionPrompt(),
          messages: [{ role: 'user', content: mensajeLimpio }],
          maxTokens: 500,
          temperature: 0.1,
          modelo: 'claude-haiku-4-5-20251001'
        });

        let accionData;
        try {
          let texto = extraccion.content.trim();
          texto = texto.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
          accionData = JSON.parse(texto);
        } catch {
          accionData = { accion: 'no_detectada', mensaje: 'No pude interpretar la acción.' };
        }

        const saludo = getSaludo(user);

        if (accionData.accion === 'no_detectada') {
          return res.json({
            session_id: sessionId,
            agentes_activos: ['DENT'],
            modelo: extraccion.modelo,
            motor: extraccion.motor,
            respuesta: `${saludo}, ${accionData.mensaje}`,
            accion_ejecutada: false,
            turnos: 0
          });
        }

        const resultado = await ejecutarAccion(accionData, userId, paciente_id, user);

        agregarAlHistorial(sessionId, 'user', mensajeLimpio);
        agregarAlHistorial(sessionId, 'assistant', resultado.mensaje);

        return res.json({
          session_id: sessionId,
          agentes_activos: ['DENT'],
          modelo: extraccion.modelo,
          motor: extraccion.motor,
          respuesta: resultado.mensaje,
          accion_ejecutada: resultado.exito,
          accion: accionData.accion,
          turnos: Math.floor(getHistorial(sessionId).length / 2)
        });

      } catch (e) {
        console.error('Error ejecutando accion:', e);
      }
    }

    // ── MODO CHAT NORMAL ─────────────────────────────────────────────────────
    const agentes = detectarAgentes(mensajeLimpio);
    const systemPrompt = buildSystemPrompt(agentes, user);

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
      accion_ejecutada: false,
      turnos: Math.floor(historial.length / 2)
    });

  } catch (error) {
    console.error('Jarvis chat error:', error);
    res.status(500).json({ error: 'Error en Jarvis OS', details: error?.message });
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
    agentes: [...Object.keys(AGENT_PATTERNS), 'ACCION']
  });
});

router.get('/sesion/:session_id', (req, res) => {
  const historial = conversaciones.get(req.params.session_id) || [];
  res.json({ session_id: req.params.session_id, turnos: Math.floor(historial.length / 2), historial });
});

router.delete('/sesion/:session_id', (req, res) => {
  conversaciones.delete(req.params.session_id);
  res.json({ message: 'Sesion eliminada' });
});

module.exports = router;