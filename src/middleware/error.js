module.exports = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err.name === 'OpenAIError') {
    return res.status(500).json({ error: 'OpenAI API error' });
  }
  next(err);
};