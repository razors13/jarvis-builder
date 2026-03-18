# Arquitectura de Jarvis Builder

## Agentes Principales

### Research-Agent
- **Rol:** Recopilar y analizar información relevante
- **Responsabilidades:**
  - Investigar tendencias en IA
  - Recopilar datos de repositorios externos
  - Generar informes de contexto
- **Ejemplos de tareas:**
  - Analizar papers de investigación en IA
  - Extraer requisitos de proyectos similares

### Builder-Agent
- **Rol:** Desarrollar componentes del sistema
- **Responsabilidades:
  - Implementar funcionalidades basadas en requisitos
  - Integrar módulos de software
  - Optimizar código generado
- **Ejemplos de tareas:
  - Crear módulos de procesamiento de datos
  - Desarrollar interfaces de usuario

### Repo-Agent
- **Rol:** Gestionar repositorios y versiones
- **Responsabilidades:
  - Administrar versiones de código
  - Clonar y actualizar repositorios
  - Gestionar dependencias
- **Ejemplos de tareas:
  - Clonar repositorios de IA
  - Actualizar dependencias de proyectos

### Prompt-Agent
- **Rol:** Optimizar prompts para IA
- **Responsabilidades:
  - Generar prompts efectivos
  - Ajustar parámetros de IA
  - Validar resultados de IA
- **Ejemplos de tareas:
  - Crear prompts para generación de código
  - Optimizar preguntas para investigación

## Flujo de Trabajo para Desarrollo de Funcionalidades
1. **Identificación de Requisito**
   - Se define la nueva funcionalidad

2. **Fase de Investigación**
   - Research-Agent analiza tendencias y requisitos
   - Genera informe de contexto

3. **Optimización de Prompts**
   - Prompt-Agent crea prompts optimizados
   - Valida efectividad de los prompts

4. **Desarrollo del Componente**
   - Builder-Agent implementa la funcionalidad
   - Usa prompts optimizados para guía

5. **Gestión de Repositorios**
   - Repo-Agent gestiona versiones
   - Asegura integración con repositorios externos

6. **Pruebas y Experimentos**
   - Se prueban en experiments/
   - Se documentan resultados

7. **Documentación**
   - Se actualiza docs/
   - Se registra el flujo completo