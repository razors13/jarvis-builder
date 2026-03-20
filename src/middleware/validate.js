/**
 * Middleware de validación de Content-Type
 * Valida que las peticiones POST y PATCH tengan Content-Type: application/json
 */
const validateContentType = (req, res, next) => {
  if (req.method === 'POST' || req.method === 'PATCH') {
    const contentType = req.get('Content-Type');
    
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({ 
        error: 'Tipo de contenido no soportado. Se requiere application/json' 
      });
    }
  }
  
  next();
};

module.exports = validateContentType;
