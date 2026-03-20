# Jarvis Builder

Proyecto de AI-Assisted Development para construir Jarvis OS.

## API de Procesamiento de Imágenes con OpenAI Vision

Esta API permite subir imágenes y obtener descripciones textuales utilizando el modelo GPT-4 Vision de OpenAI.

### Características

- Validación de archivos (JPEG/PNG, máximo 10MB)
- Rate limiting (100 requests por 15 minutos)
- Manejo de errores robusto
- Pruebas unitarias e integración
- Documentación OpenAPI/Swagger
- CI/CD con GitHub Actions

## Estructura del Proyecto

```
jarvis-builder/
├── README.md                 # Documentación principal
├── package.json              # Configuración de dependencias y scripts
├── .env                     # Variables de entorno (no versionar)
├── .gitignore               # Archivos ignorados por git
├── .github/                 # Configuración de CI/CD
│   └── workflows/
│       └── ci.yml          # Pipeline de integración continua
├── src/                     # Código fuente de la aplicación
│   ├── server.js            # Servidor principal con configuración
│   ├── middleware/          # Middleware personalizados
│   │   ├── upload.js       # Configuración de Multer
│   │   └── error.js        # Manejo de errores global
│   └── routes/              # Rutas de la API
│       └── describe.js      # Endpoint de descripción de imágenes
├── tests/                   # Pruebas unitarias e integración
│   ├── describe.unit.test.js
│   └── describe.integration.test.js
├── docs/                    # Documentación de la API
│   └── swagger.json        # Especificación OpenAPI
├── agents/                  # Agentes de IA
├── dashboard/               # Panel de control
├── experiments/             # Pruebas y prototipos
├── jarvis-os/               # Módulo principal del sistema
├── plans/                   # Planificación del proyecto
└── prompts/                 # Prompts para modelos de IA
```

## Instalación

1. Clonar el repositorio
2. Instalar dependencias: `npm install`
3. Configurar variable de entorno: `OPENAI_API_KEY=tu_clave` en `.env`
4. Iniciar la aplicación: `npm start`

## Scripts Disponibles

- `npm start` - Iniciar el servidor en http://localhost:3000
- `npm test` - Ejecutar pruebas unitarias e integración
- `npm run test:watch` - Ejecutar pruebas en modo watch

## API Endpoints

### GET /

Página de inicio que devuelve un mensaje de bienvenida.

**Respuesta:**
```json
{
  "message": "Image Processing API with OpenAI Vision"
}
```

### POST /api/v1/describe

Sube una imagen y recibe una descripción textual generada por GPT-4 Vision.

**Parámetros (form-data):**
- `image` (file, requerido) - Imagen en formato JPEG o PNG (máximo 10MB)

**Respuesta exitosa (200):**
```json
{
  "description": "Una descripción detallada de la imagen..."
}
```

**Errores:**
- `400` - No se proporcionó archivo o tipo inválido
- `500` - Error de la API de OpenAI

**Ejemplo con cURL:**
```bash
curl -X POST \
  http://localhost:3000/api/v1/describe \
  -F "image=@ruta/a/tu/imagen.jpg"
```

**Ejemplo con JavaScript (fetch):**
```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);

fetch('http://localhost:3000/api/v1/describe', {
  method: 'POST',
  body: formData
})
.then(res => res.json())
.then(data => console.log(data.description));
```

## Dependencias Principales

- **express** (^4.18.2) - Framework web
- **multer** (^1.4.5-lts.1) - Middleware para multipart/form-data
- **dotenv** (^16.0.3) - Variables de entorno
- **openai** (^3.0.0) - Cliente oficial de OpenAI
- **express-rate-limit** (^6.1.0) - Rate limiting
- **jest** (^29.7.0) - Framework de pruebas
- **supertest** (^6.3.3) - Pruebas de integración HTTP

## Documentación de la API

La especificación completa de la API está disponible en:
- `docs/swagger.json` (OpenAPI 3.0)

Puedes visualizarla en [Swagger Editor](https://editor.swagger.io/) importando el archivo.

## Desarrollo

### Ejecutar pruebas

```bash
npm test
```

### Ejecutar pruebas en modo watch

```bash
npm run test:watch
```

### Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```
OPENAI_API_KEY=tu_clave_api_aqui
PORT=3000
```

## Limitaciones y Consideraciones

- Tamaño máximo de imagen: 10 MB
- Tipos de archivo permitidos: JPEG, PNG
- Rate limit: 100 requests por IP cada 15 minutos
- Se requiere una API key válida de OpenAI
- El modelo utilizado es `gpt-4-vision-preview`

## Seguridad

- Las claves de API nunca deben exponerse en el cliente
- El archivo `.env` está en `.gitignore`
- Validación estricta de tipos MIME
- Límite de tamaño de archivo
- Rate limiting para prevenir abusos

## Modos disponibles

- product
- marketing
- technical
- branding
- 3d_product
- quote
- bundle

## Endpoint principal

POST /api/v1/describe

### Body (form-data)

- image: archivo
- mode: texto

## Ejemplos de uso

- mode=marketing
- mode=quote
- mode=bundle

## Licencia

MIT License