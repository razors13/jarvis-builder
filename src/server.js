const express = require('express');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });

app.use(express.json());
const validateContentType = require('./middleware/validate');
app.use(validateContentType);
app.use(limiter);

const path = require('path');
const fs = require('fs');

// Servir index.html SIEMPRE fresco desde disco - sin cache
app.get(['/', '/index.html'], (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  const content = fs.readFileSync(filePath, 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Length', Buffer.byteLength(content, 'utf8'));
  res.send(content);
});

// Archivos estaticos (NO sirve index.html)
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  etag: false,
  lastModified: false
}));

app.get('/api', (req, res) => { res.json({ message: 'JARVIS OS API v2' }); });

const authRouter = require('./routes/auth');
app.use('/api/v1/auth', authRouter);

const requireAuth = require('./middleware/auth');

const describeRouter = require('./routes/describe');
app.use('/api/v1', requireAuth, describeRouter);

const patientsRouter = require('./routes/patients');
app.use('/api/v1/pacientes', requireAuth, patientsRouter);

const appointmentsRouter = require('./routes/appointments');
app.use('/api/v1/citas', requireAuth, appointmentsRouter);

const presupuestosRouter = require('./routes/presupuestos');
app.use('/api/v1/presupuestos', requireAuth, presupuestosRouter);

const ordersRouter = require('./routes/orders');
app.use('/api/v1/pedidos', requireAuth, ordersRouter);

const derivacionesRouter = require('./routes/derivaciones');
app.use('/api/v1/derivaciones', requireAuth, derivacionesRouter);

const adminRouter = require('./routes/admin');
app.use('/api/v1/admin', requireAuth, adminRouter);

const evolucionesRouter = require('./routes/evoluciones');
app.use('/api/v1/evoluciones', requireAuth, evolucionesRouter);

const chatRouter = require('./routes/chat');
app.use('/api/v1/chat', requireAuth, chatRouter);

const imagenesRouter = require('./routes/imagenes');
app.use('/api/v1/imagenes', requireAuth, imagenesRouter);

const prescriptionsRouter = require('./routes/prescriptions');
app.use('/api/v1/prescriptions', requireAuth, prescriptionsRouter);

const consentimientosRouter = require('./routes/consentimientos');
app.use('/api/v1/consentimientos', requireAuth, consentimientosRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

if (require.main === module) {
  app.listen(PORT, () => { console.log(`Server running on port ${PORT}`); });
}

module.exports = app;ria civi
