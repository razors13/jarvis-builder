const express = require('express');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});

app.use(express.json());
const validateContentType = require('./middleware/validate');
app.use(validateContentType);
app.use(limiter);

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api', (req, res) => {
  res.json({ message: 'JARVIS OS API v2' });
});

// AUTH — sin protección
const authRouter = require('./routes/auth');
app.use('/api/v1/auth', authRouter);

// MIDDLEWARE de autenticación
const requireAuth = require('./middleware/auth');

// RUTAS PROTEGIDAS
const describeRouter = require('./routes/describe');
app.use('/api/v1', requireAuth, describeRouter);

const patientsRouter = require('./routes/patients');
app.use('/api/v1/pacientes', requireAuth, patientsRouter);

const appointmentsRouter = require('./routes/appointments');
app.use('/api/v1/citas', requireAuth, appointmentsRouter);

const quotesRouter = require('./routes/quotes');
app.use('/api/v1/presupuestos', requireAuth, quotesRouter);

const ordersRouter = require('./routes/orders');
app.use('/api/v1/pedidos', requireAuth, ordersRouter);

const derivacionesRouter = require('./routes/derivaciones');
app.use('/api/v1/derivaciones', requireAuth, derivacionesRouter);

const evolucionesRouter = require('./routes/evoluciones');
app.use('/api/v1/evoluciones', requireAuth, evolucionesRouter);

const chatRouter = require('./routes/chat');
app.use('/api/v1/chat', requireAuth, chatRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;