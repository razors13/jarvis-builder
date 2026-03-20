const express = require('express');
require('dotenv').config();

const app = express();
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

app.get('/', (req, res) => {
  res.json({ message: 'Image Processing API with OpenRouter Vision' });
});

const describeRouter = require('./routes/describe');
app.use('/api/v1', describeRouter);
const patientsRouter = require('./routes/patients');
app.use('/api/v1/pacientes', patientsRouter);
const appointmentsRouter = require('./routes/appointments');
app.use('/api/v1/citas', appointmentsRouter);
const quotesRouter = require('./routes/quotes');
app.use('/api/v1/presupuestos', quotesRouter);
const ordersRouter = require('./routes/orders');
app.use('/api/v1/pedidos', ordersRouter);
const chatRouter = require('./routes/chat');
app.use('/api/v1/chat', chatRouter);

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
