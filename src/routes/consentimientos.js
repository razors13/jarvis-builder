const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// Templates de consentimientos
const TEMPLATES = {
  general: {
    nombre: "Consentimiento General",
    contenido: "Yo, {{NOMBRE}}, RUT {{RUT}}, declaro haber sido informado/a por el/la Dr/a {{DOCTOR}} sobre mi tratamiento odontológico. Comprendo los procedimientos a realizar, sus beneficios, riesgos y alternativas de tratamiento. He tenido la oportunidad de hacer preguntas y han sido respondidas satisfactoriamente. Autorizo la realización del tratamiento y el uso de anestesia local si fuera necesario. Entiendo que puedo revocar este consentimiento en cualquier momento antes del procedimiento.\n\nFecha: {{FECHA}}\nClínica: Jarvis OS"
  },
  invasivo: {
    nombre: "Procedimiento Invasivo",
    contenido: "Yo, {{NOMBRE}}, RUT {{RUT}}, autorizo al/la Dr/a {{DOCTOR}} a realizar el procedimiento de {{TRATAMIENTO}}.\n\nRiesgos informados:\n- Dolor o molestia post-operatoria\n- Inflamación y hematoma en la zona\n- Sangrado leve post-procedimiento\n- Riesgo de infección (poco frecuente)\n- Necesidad de medicación post-operatoria\n\nMe han explicado las instrucciones post-operatorias y me comprometo a seguirlas. Entiendo que debo contactar a la clínica ante cualquier complicación.\n\nFecha: {{FECHA}}"
  },
  endodoncia: {
    nombre: "Tratamiento de Conducto",
    contenido: "Yo, {{NOMBRE}}, RUT {{RUT}}, autorizo al/la Dr/a {{DOCTOR}} a realizar tratamiento endodóntico (tratamiento de conducto) en pieza dental {{TRATAMIENTO}}.\n\nHe sido informado/a sobre:\n- El procedimiento puede requerir 1 o más sesiones\n- Se utilizará anestesia local\n- Puede existir sensibilidad post-tratamiento\n- La pieza puede requerir una corona o restauración final\n- En casos complejos puede ser necesaria derivación a especialista\n- Existe un porcentaje de casos que requieren retratamiento\n\nFecha: {{FECHA}}"
  },
  estetica: {
    nombre: "Procedimiento Estético",
    contenido: "Yo, {{NOMBRE}}, RUT {{RUT}}, solicito y autorizo al/la Dr/a {{DOCTOR}} realizar el procedimiento estético dental de {{TRATAMIENTO}}.\n\nDeclaro que:\n- He sido informado/a sobre el procedimiento, sus alcances y limitaciones\n- Los resultados pueden variar según características individuales\n- Pueden requerirse sesiones adicionales según evolución\n- He declarado todas mis condiciones médicas relevantes\n- No tengo expectativas irreales sobre el resultado final\n\nFecha: {{FECHA}}"
  },
  menor: {
    nombre: "Menor de Edad",
    contenido: "Yo, {{TUTOR}}, RUT {{RUT_TUTOR}}, en calidad de {{PARENTESCO}} del menor {{NOMBRE}}, autorizo al/la Dr/a {{DOCTOR}} a realizar el tratamiento odontológico de {{TRATAMIENTO}}.\n\nDeclaro ser el/la representante legal del menor y asumo la responsabilidad del tratamiento indicado. He sido informado/a sobre el procedimiento, riesgos y beneficios.\n\nNombre del menor: {{NOMBRE}}\nFecha de nacimiento: {{FECHA_NAC}}\n\nFecha: {{FECHA}}"
  }
};

// GET /api/v1/consentimientos?paciente_id=X
// Lista consentimientos del paciente ordenados por created_at desc
router.get('/', async (req, res) => {
  try {
    const { paciente_id } = req.query;

    if (!paciente_id) {
      return res.status(400).json({ error: 'paciente_id es requerido' });
    }

    // Obtener consentimientos de la BD
    const { data, error } = await supabase
      .from('consentimientos')
      .select('*')
      .eq('paciente_id', parseInt(paciente_id))
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/consentimientos/templates
// Retorna los 5 templates de consentimientos
router.get('/templates', (req, res) => {
  try {
    res.json(TEMPLATES);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/consentimientos
// Crea un nuevo consentimiento
router.post('/', async (req, res) => {
  try {
    const { paciente_id, template, contenido_final, nombre_firma, rut_firma } = req.body;

    // Validar campos requeridos
    if (!paciente_id || !template || !contenido_final || !nombre_firma || !rut_firma) {
      return res.status(400).json({
        error: 'paciente_id, template, contenido_final, nombre_firma y rut_firma son requeridos'
      });
    }

    // Obtener IP del cliente
    const ip_address = req.ip || req.headers['x-forwarded-for'] || 'desconocida';

    // Obtener email del paciente
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .select('email')
      .eq('id', parseInt(paciente_id))
      .single();

    if (pacienteError) throw pacienteError;

    // Crear consentimiento en BD
    const { data: consentimiento, error: dbError } = await supabase
      .from('consentimientos')
      .insert({
        paciente_id: parseInt(paciente_id),
        doctor_id: req.user.id,
        template: template,
        contenido_final: contenido_final,
        nombre_firma: nombre_firma,
        rut_firma: rut_firma,
        ip_address: ip_address,
        email_enviado: false,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) throw dbError;

    res.status(201).json(consentimiento);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/consentimientos/:id/pdf-data
// Retorna datos del consentimiento para generar PDF en frontend
router.get('/:id/pdf-data', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener consentimiento
    const { data: consentimiento, error: dbError } = await supabase
      .from('consentimientos')
      .select('*')
      .eq('id', parseInt(id))
      .single();

    if (dbError || !consentimiento) {
      return res.status(404).json({ error: 'Consentimiento no encontrado' });
    }

    // Obtener datos del paciente
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .select('nombre, rut, email')
      .eq('id', consentimiento.paciente_id)
      .single();

    if (pacienteError) throw pacienteError;

    // Obtener datos del doctor
    const { data: doctor, error: doctorError } = await supabase
      .from('usuarios')
      .select('nombre_completo')
      .eq('id', consentimiento.doctor_id)
      .single();

    if (doctorError) throw doctorError;

    res.json({
      consentimiento: consentimiento,
      paciente: paciente,
      doctor: doctor
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
