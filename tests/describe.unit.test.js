const request = require('supertest');
const app = require('../src/server');

describe('GET /', () => {
  it('should return welcome message', async () => {
    const response = await request(app)
      .get('/')
      .expect(200);
    
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toBe('Image Processing API with OpenAI Vision');
  });
});