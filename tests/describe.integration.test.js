const request = require('supertest');
const app = require('../src/server');

describe('POST /api/v1/describe', () => {
  it('should return 400 when no image file is provided', async () => {
    const response = await request(app)
      .post('/api/v1/describe')
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('No image file provided');
  });

  it('should return 400 when invalid file type is provided', async () => {
    const response = await request(app)
      .post('/api/v1/describe')
      .attach('image', Buffer.from('fake content'), 'test.txt')
      .expect(400);
    
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid file type');
  });
});