# Directorio .github/

Contiene configuración de integración continua y despliegue.

## Estructura

```
.github/
└── workflows/              # Flujos de trabajo de GitHub Actions
    └── ci.yml             # Pipeline de CI para pruebas
```

## Configuración Actual

- **ci.yml**: Pipeline que ejecuta pruebas automáticamente en pushes y pull requests
- **Ubuntu 18.04**: Entorno de ejecución
- **Node.js 18**: Versión de Node.js utilizada
- **npm ci**: Instalación de dependencias
- **npm test**: Ejecución de pruebas unitarias e integración