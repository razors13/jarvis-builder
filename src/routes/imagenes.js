const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const supabase = require('../lib/supabase');
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });


// Configurar multer para uploads en memoria
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPEG, PNG, WebP, GIF)'));
    }
  }
});

// GET /api/v1/imagenes?paciente_id=X
// Lista imágenes del paciente con URLs firmadas
router.get('/', async (req, res) => {
  try {
    const { paciente_id } = req.query;
    
    if (!paciente_id) {
      return res.status(400).json({ error: 'paciente_id es requerido' });
    }

    // Obtener imágenes de la BD
    const { data, error } = await supabase
      .from('imagenes_clinicas')
      .select('*')
      .eq('paciente_id', parseInt(paciente_id))
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Generar URLs firmadas para cada imagen
    const imagenesConUrls = await Promise.all(
      (data || []).map(async (img) => {
        try {
          const { data: signedUrl } = await supabase.storage
            .from('imagenes-clinicas')
            .createSignedUrl(img.ruta_storage, 3600); // 1 hora

          return {
            ...img,
            url_firmada: signedUrl?.signedUrl || null
          };
        } catch (e) {
          console.error('Error generando URL firmada:', e);
          return { ...img, url_firmada: null };
        }
      })
    );

    res.json(imagenesConUrls);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/imagenes/upload
// Sube una imagen y crea registro en BD
router.post('/upload', upload.single('archivo'), async (req, res) => {
  try {
    const { paciente_id, tipo, notas } = req.body;
    const file = req.file;

    if (!paciente_id || !file) {
      return res.status(400).json({ error: 'paciente_id y archivo son requeridos' });
    }

    if (!['intraoral', 'extraoral', 'radiografia', 'otro'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo inválido' });
    }

    // Generar nombre de archivo con timestamp
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const nombreArchivo = `${timestamp}_${file.originalname}`;
    const rutaStorage = `paciente_${paciente_id}/${nombreArchivo}`;

    // Subir a Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('imagenes-clinicas')
      .upload(rutaStorage, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Crear registro en BD
    const { data: imagen, error: dbError } = await supabase
      .from('imagenes_clinicas')
      .insert({
        paciente_id: parseInt(paciente_id),
        doctor_id: req.user.id,
        tipo: tipo,
        ruta_storage: rutaStorage,
        nombre_original: file.originalname,
        tamaño_bytes: file.size,
        notas: notas || null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) throw dbError;

    // Generar URL firmada
    const { data: signedUrl } = await supabase.storage
      .from('imagenes-clinicas')
      .createSignedUrl(rutaStorage, 3600);

    res.status(201).json({
      ...imagen,
      url_firmada: signedUrl?.signedUrl || null
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/imagenes/:id/analizar
// Analiza imagen con Claude vision
router.post('/:id/analizar', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener imagen de BD
    const { data: imagen, error: dbError } = await supabase
      .from('imagenes_clinicas')
      .select('*')
      .eq('id', parseInt(id))
      .single();

    if (dbError || !imagen) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    // Generar URL firmada
    const { data: signedUrl } = await supabase.storage
      .from('imagenes-clinicas')
      .createSignedUrl(imagen.ruta_storage, 3600);

    if (!signedUrl?.signedUrl) {
      return res.status(500).json({ error: 'No se pudo obtener URL de imagen' });
    }

    // Llamar a Claude con vision
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `Eres un asistente de diagnóstico odontológico.
Analiza esta imagen clínica dental y responde
SOLO con JSON válido sin markdown:
{
  hallazgos: [
    {
      diente: '1.6',
      descripcion: 'descripción clínica detallada',
      condicion: 'sano|caries|restaurado|corona|endodoncia|implante|extraccion',
      severidad: 'leve|moderado|severo',
      accion_sugerida: 'acción recomendada'
    }
  ],
  resumen: 'resumen general del caso',
  prioridad: 'baja|media|alta|urgente'
}
Si no puedes identificar dientes específicos,
usa descripcion general sin numero de diente.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: signedUrl.signedUrl
              }
            },
            {
              type: 'text',
              text: 'Analiza esta imagen dental clínica.'
            }
          ]
        }
      ]
    });

    // Extraer JSON de la respuesta
    let analisisJson = null;
    const content = response.content[0];
    
    if (content.type === 'text') {
      try {
        // Intentar parsear directamente
        analisisJson = JSON.parse(content.text);
      } catch (e) {
        // Si falla, buscar JSON en el texto
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analisisJson = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No se pudo extraer JSON de la respuesta');
        }
      }
    }

    // Guardar análisis en BD
    const { data: actualizada, error: updateError } = await supabase
      .from('imagenes_clinicas')
      .update({
        analisis_ia: analisisJson,
        analizado_en: new Date().toISOString()
      })
      .eq('id', parseInt(id))
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      id: actualizada.id,
      analisis: analisisJson
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/v1/imagenes/:id
// Elimina imagen del storage y BD
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener imagen
    const { data: imagen, error: dbError } = await supabase
      .from('imagenes_clinicas')
      .select('*')
      .eq('id', parseInt(id))
      .single();

    if (dbError || !imagen) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }

    // Verificar permisos (doctor propietario o admin)
    if (imagen.doctor_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta imagen' });
    }

    // Eliminar del storage
    const { error: storageError } = await supabase.storage
      .from('imagenes-clinicas')
      .remove([imagen.ruta_storage]);

    if (storageError) throw storageError;

    // Eliminar de BD
    const { error: deleteError } = await supabase
      .from('imagenes_clinicas')
      .delete()
      .eq('id', parseInt(id));

    if (deleteError) throw deleteError;

    res.json({ mensaje: 'Imagen eliminada exitosamente' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
