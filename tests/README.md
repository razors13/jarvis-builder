# Directorio tests/

Contiene pruebas unitarias e integración para la API.

## Estructura

```
tests/
├── describe.unit.test.js      # Pruebas unitarias de validación y lógica
└── describe.integration.test.js # Pruebas de integración con supertest
```

## Pruebas Implementadas

- **describe.unit.test.js**: Pruebas del endpoint GET / y validaciones básicas
- **describe.integration.test.js**: Pruebas del endpoint POST /api/v1/describe con escenarios de error

## Frameworks Utilizados

- **Jest**: Framework de pruebas unitarias
- **Supertest**: Pruebas de integración para endpoints HTTP