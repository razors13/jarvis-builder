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
app.use(limiter);

app.get('/', (req, res) => {
  res.json({ message: 'Image Processing API with OpenRouter Vision' });
});

const describeRouter = require('./routes/describe');
app.use('/api/v1', describeRouter);

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