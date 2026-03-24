const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET /api/v1/prescriptions?paciente_id=X
// Lista recetas del paciente ordenadas por created_at desc
router.get('/', async (req, res) => {
  try {
    const { paciente_id } = req.query;

    if (!paciente_id) {
      return res.status(400).json({ error: 'paciente_id es requerido' });
    }

    // Obtener recetas de la BD
    const { data, error } = await supabase
      .from('prescriptions')
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

// POST /api/v1/prescriptions/sugerir
// Sugiere medicamentos y posología usando Claude
router.post('/sugerir', async (req, res) => {
  try {
    const { paciente_id, medicamentos, tratamiento_referencia } = req.body;

    if (!paciente_id || !medicamentos || !Array.isArray(medicamentos) || medicamentos.length === 0) {
      return res.status(400).json({
        error: 'paciente_id y medicamentos (array no vacío) son requeridos'
      });
    }

    // Obtener alergias y notas médicas del paciente
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .select('alergias, notas_medicas')
      .eq('id', parseInt(paciente_id))
      .single();

    if (pacienteError || !paciente) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    // Preparar mensaje para Claude
    const userMessage = `Medicamentos indicados: ${medicamentos.join(', ')}
Tratamiento realizado: ${tratamiento_referencia || 'no especificado'}
Alergias del paciente: ${paciente.alergias || 'ninguna'}
Notas médicas: ${paciente.notas_medicas || 'ninguna'}`;

    // Llamar a Claude
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `Eres un asistente de prescripción dental chileno.
Dado un listado de medicamentos y el tratamiento realizado,
sugiere la posología completa para cada medicamento.
Responde SOLO con JSON válido sin markdown:
{
  items: [
    {
      medicamento: string,
      dosis: string,
      frecuencia: string,
      duracion: string,
      indicaciones: string,
      sugerido_por_ia: true,
      advertencia: string o null
    }
  ],
  sugerencias_adicionales: [
    {
      medicamento: string,
      razon: string,
      dosis: string,
      frecuencia: string,
      duracion: string,
      indicaciones: string
    }
  ],
  advertencias_alergias: string o null
}
Si el paciente tiene alergia a algún medicamento indicado,
advertir en advertencia del item Y en advertencias_alergias.
Posología estándar para odontología chilena.
Duraciones en días. Frecuencias en horas.`,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    });

    // Extraer JSON de la respuesta
    let sugerencias = null;
    const content = response.content[0];

    if (content.type === 'text') {
      try {
        // Intentar parsear directamente
        sugerencias = JSON.parse(content.text);
      } catch (e) {
        // Si falla, buscar JSON en el texto
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          sugerencias = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No se pudo extraer JSON de la respuesta');
        }
      }
    }

    res.json(sugerencias);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/prescriptions
// Crea una nueva receta
router.post('/', async (req, res) => {
  try {
    const { paciente_id, items, notas, tratamiento_referencia } = req.body;

    // Validar campos requeridos
    if (!paciente_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: 'paciente_id e items (array no vacío) son requeridos'
      });
    }

    // Validar estructura de items
    for (const item of items) {
      if (!item.medicamento || !item.dosis || !item.frecuencia || !item.duracion) {
        return res.status(400).json({
          error: 'Cada item debe tener: medicamento, dosis, frecuencia, duracion'
        });
      }
    }

    // Crear receta en BD
    const { data: receta, error: dbError } = await supabase
      .from('prescriptions')
      .insert({
        paciente_id: parseInt(paciente_id),
        doctor_id: req.user.id,
        items: items,
        notas: notas || null,
        tratamiento_referencia: tratamiento_referencia || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) throw dbError;

    res.status(201).json(receta);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/v1/prescriptions/:id
// Elimina una receta (solo doctor propietario o admin)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener receta
    const { data: receta, error: dbError } = await supabase
      .from('prescriptions')
      .select('*')
      .eq('id', parseInt(id))
      .single();

    if (dbError || !receta) {
      return res.status(404).json({ error: 'Receta no encontrada' });
    }

    // Verificar permisos (doctor propietario o admin)
    if (receta.doctor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'No tienes permiso para eliminar esta receta'
      });
    }

    // Eliminar de BD
    const { error: deleteError } = await supabase
      .from('prescriptions')
      .delete()
      .eq('id', parseInt(id));

    if (deleteError) throw deleteError;

    res.json({ mensaje: 'Receta eliminada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
