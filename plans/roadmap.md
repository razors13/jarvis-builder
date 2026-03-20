# API de Procesamiento de Imágenes con OpenAI Vision

## Objetivo
Crear una API REST en Node.js que reciba imágenes, las procese mediante la API de visión de OpenAI y devuelva una descripción textual.

## Tecnologías
- Node.js (v18+)
- Express.js
- Multer (para manejar multipart/form-data)
- OpenAI API (endpoint: /v1/images/{image}/embeddings o /v1/chat/completions con modelo de visión)
- dotenv (para variables de entorno)
- Jest (para pruebas)

## Arquitectura
1. **Ruta de carga**: `POST /api/v1/describe`
   - Usa Multer para recibir el archivo.
   - Valida tipo y tamaño.
2. **Procesamiento**: 
   - Convierte la imagen a base64 o envía el buffer a OpenAI.
   - Llama a la API de visión (modelo `dall-e-3` o `gpt-4-vision`).
   - Extrae la descripción del resultado.
3. **Respuesta**: 
   - JSON con `{ description: "..." }`.
   - Códigos de estado apropiados (200, 400, 500).

## Flujo de trabajo
1. Configurar proyecto (`npm init -y`).
2. Instalar dependencias (`npm install express multer dotenv openai`).
3. Crear `.env` con `OPENAI_API_KEY`.
4. Implementar servidor básico.
5. Añadir middleware de carga de archivos.
6. Integrar llamada a OpenAI.
7. Manejar errores y validaciones.
8. Escribir pruebas unitarias y de integración.
9. Documentar API con Swagger/OpenAPI.
10. Desplegar (opcional) en un entorno cloud.

## Consideraciones
- Límite de tamaño de imagen (ej. 10 MB).
- Rate limiting para evitar abusos.
- Almacenamiento temporal de imágenes (usar memoria o carpeta `uploads`).
- Seguridad: validar tipos MIME, limitar extensiones.
- Manejo de cuotas de OpenAI.

## Próximos pasos
- [ ] Inicializar repositorio y crear estructura de carpetas.
- [ ] Instalar dependencias.
- [ ] Configurar variables de entorno.
- [ ] Implementar endpoint de descripción.
- [ ] Probar con imágenes de muestra.
- [ ] Añadir documentación y pruebas.