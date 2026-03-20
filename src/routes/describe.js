const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Jarvis Builder'
  }
});

router.post('/describe', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image file uploaded'
      });
    }

    const mode = req.body.mode || 'product';
    let prompt = '';

    if (mode === 'product') {
      prompt = `
Analiza esta imagen y responde SOLO en JSON válido, sin texto extra, sin markdown.

Usa exactamente esta estructura:
{
  "name": "string",
  "description": "string",
  "style": "string",
  "colors": ["string"],
  "possible_use": "string",
  "target_audience": "string",
  "tags": ["string"]
}

Reglas:
- Responde en español.
- "name" debe ser breve.
- "description" debe tener entre 1 y 3 frases.
- "colors" debe ser una lista corta.
- "tags" debe tener entre 3 y 6 etiquetas.
- Enfócate en describir la imagen como un producto o activo de marca.
      `.trim();

    } else if (mode === 'marketing') {
      prompt = `
Analiza esta imagen y responde SOLO en JSON válido, sin texto extra, sin markdown.

Usa exactamente esta estructura:
{
  "hook": "string",
  "description": "string",
  "hashtags": ["string"]
}

Reglas:
- Responde en español.
- "hook" debe ser corto, atractivo y persuasivo.
- "description" debe sonar como texto para Instagram o marketing.
- "hashtags" debe tener entre 4 y 8 elementos.
      `.trim();

    } else if (mode === 'technical') {
      prompt = `
Analiza esta imagen y responde SOLO en JSON válido, sin texto extra, sin markdown.

Usa exactamente esta estructura:
{
  "elements": ["string"],
  "composition": "string",
  "colors": ["string"],
  "style": "string"
}

Reglas:
- Responde en español.
- Sé técnico y objetivo.
- Describe elementos visuales, composición y estilo.
      `.trim();

    } else if (mode === 'branding') {
      prompt = `
Analiza esta imagen y responde SOLO en JSON válido, sin texto extra, sin markdown.

Usa exactamente esta estructura:
{
  "brand_personality": "string",
  "tone": "string",
  "slogan": "string",
  "value_proposition": "string"
}

Reglas:
- Responde en español.
- Piensa la imagen como base de una identidad de marca.
- "brand_personality" debe describir la personalidad de la marca.
- "tone" debe definir el tono comunicacional.
- "slogan" debe ser breve y memorable.
- "value_proposition" debe explicar qué transmite o aporta la marca.
      `.trim();

    } else if (mode === '3d_product') {
      prompt = `
Analiza esta imagen como si fuera un diseño o producto potencial para impresión 3D, branding o merchandising.

Responde SOLO en JSON válido, sin texto extra, sin markdown.

Usa exactamente esta estructura:
{
  "object_type": "string",
  "recommended_material": "string",
  "finish": "string",
  "target_market": "string",
  "estimated_value": "string"
}

Reglas:
- Responde en español.
- Interpreta la imagen como activo visual, logo, pieza decorativa o producto imprimible en 3D.
- NO asumas significados literales del nombre de la marca.
- "object_type" debe describir qué tipo de pieza se podría fabricar.
- "recommended_material" debe sugerir material realista de impresión 3D.
- "finish" debe proponer un acabado comercial atractivo.
- "target_market" debe enfocarse en branding, regalos corporativos, decoración, merchandising o clientes de impresión 3D.
- "estimated_value" debe ser un rango comercial estimado simple.
      `.trim();

    } else if (mode === 'quote') {
      prompt = `
Analiza esta imagen como un producto imprimible en 3D y genera una estimación técnica y comercial.

Responde SOLO en JSON válido, sin texto extra, sin markdown.

Usa exactamente esta estructura:
{
  "object_type": "string",
  "recommended_material": "string",
  "suggested_size": "string",
  "print_time": "string",
  "difficulty": "string",
  "estimated_cost": "string",
  "suggested_price": "string",
  "profit_margin": "string"
}

Reglas:
- Responde en español.
- Piensa como un negocio de impresión 3D real.
- "suggested_size" en cm o mm, formato claro (ej: 8x8 cm o 80x80 mm).
- "print_time" estimado (ej: 2-5 horas).
- "difficulty" = baja / media / alta.
- "estimated_cost" = costo producción.
- "suggested_price" = precio de venta.
- "profit_margin" debe indicar el margen aproximado entre costo y precio.
      `.trim();

    } else if (mode === 'bundle') {
      prompt = `
Analiza esta imagen y genera ideas de productos en pack para venta.

Responde SOLO en JSON válido, sin texto extra, sin markdown.

Usa exactamente esta estructura:
{
  "bundle_name": "string",
  "products": ["string"],
  "target_client": "string",
  "estimated_bundle_price": "string",
  "concept": "string"
}

Reglas:
- Responde en español.
- Piensa como venta real.
- Incluye 2-4 productos.
- Enfócate en branding y merchandising.
      `.trim();

    } else {
      prompt = `
Analiza esta imagen y responde SOLO en JSON válido, sin texto extra, sin markdown.

Usa exactamente esta estructura:
{
  "description": "string"
}

Responde en español.
      `.trim();
    }

    const mimeType = req.file.mimetype || 'image/png';
    const base64Image = req.file.buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Image}`;
    const model = process.env.OPENROUTER_MODEL || 'openrouter/free';

    const response = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ]
    });

    const rawContent = response?.choices?.[0]?.message?.content;

    let textOutput = '';

    if (typeof rawContent === 'string') {
      textOutput = rawContent.trim();
    } else if (Array.isArray(rawContent)) {
      textOutput = rawContent
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part?.type === 'text') return part.text || '';
          return '';
        })
        .join(' ')
        .trim();
    }

    if (!textOutput) {
      return res.json({
        message: 'Image processed successfully',
        model,
        warning: 'Model returned no text description',
        raw: response
      });
    }

    const cleaned = textOutput
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      return res.json({
        message: 'Image processed successfully',
        model,
        warning: 'Model returned non-JSON text',
        raw_text: textOutput
      });
    }

    return res.json({
      message: 'Image processed successfully',
      model,
      mode,
      result: parsed
    });
  } catch (error) {
    console.error('OpenRouter API error:', error);

    return res.status(500).json({
      error: 'Image processing failed',
      details: error?.error?.message || error?.message || 'Unknown error'
    });
  }
});

module.exports = router;