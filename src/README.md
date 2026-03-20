# Directorio src/

Contiene el código fuente de la aplicación Node.js.

## Estructura

```
src/
├── server.js            # Servidor principal con configuración
├── middleware/          # Middleware personalizados
│   ├── upload.js       # Manejo de carga de archivos con Multer
│   └── error.js        # Manejo de errores global
└── routes/              # Rutas de la API
    └── describe.js      # Endpoint de descripción de imágenes
```

## Componentes Principales

- **server.js**: Configuración del servidor Express, rate limiting y middleware
- **middleware/upload.js**: Configuración de Multer para validación de archivos
- **middleware/error.js**: Manejo centralizado de errores
- **routes/describe.js**: Lógica del endpoint de procesamiento de imágenes