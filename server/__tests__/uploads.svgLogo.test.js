jest.mock('../middleware/auth', () => ({
  authenticateToken: (req, res, next) => {
    req.user = {
      _id: 'user-123',
      id: 'user-123',
      email: 'admin@example.com',
      role: 'Admin'
    };
    next();
  },
  requireRole: () => (req, res, next) => next()
}));

jest.mock('../utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
}));

const mockPutObject = jest.fn(() => ({
  promise: jest.fn().mockResolvedValue({})
}));
const mockGetSignedUrl = jest.fn(() => 'https://s3.example/presigned');
const mockHeadObject = jest.fn(() => ({
  promise: jest.fn().mockResolvedValue({})
}));

jest.mock('aws-sdk', () => {
  const S3 = jest.fn(() => ({
    putObject: mockPutObject,
    getSignedUrl: mockGetSignedUrl,
    headObject: mockHeadObject
  }));
  return { S3 };
});

process.env.AWS_S3_BUCKET = 'test-bucket';
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
process.env.AWS_REGION = 'us-east-1';

const express = require('express');
const request = require('supertest');
const uploadsRouter = require('../routes/uploads');

describe('SVG logo upload route', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/uploads', uploadsRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const safeSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
    'utf8'
  );

  test('uploads sanitized SVG for image fileType and returns public URL', async () => {
    const response = await request(app)
      .post('/api/uploads/svg-logo')
      .field('fileType', 'image')
      .attach('file', safeSvg, {
        filename: 'logo.svg',
        contentType: 'image/svg+xml'
      });

    expect(response.status).toBe(200);
    expect(response.body.publicUrl).toMatch(/^\/api\/uploads\/public\/image\/user-123\//);
    expect(response.body.key).toMatch(/^image\/user-123\/.+\.svg$/);
    expect(mockPutObject).toHaveBeenCalledTimes(1);
    const putArgs = mockPutObject.mock.calls[0][0];
    expect(putArgs.ContentType).toBe('image/svg+xml');
    expect(putArgs.Body.toString('utf8')).toContain('<circle');
    expect(putArgs.Body.toString('utf8')).not.toContain('<script');
  });

  test('uploads sanitized SVG for booth-logo fileType', async () => {
    const response = await request(app)
      .post('/api/uploads/svg-logo')
      .field('fileType', 'booth-logo')
      .attach('file', safeSvg, {
        filename: 'booth.svg',
        contentType: 'image/svg+xml'
      });

    expect(response.status).toBe(200);
    expect(response.body.key).toMatch(/^booth-logo\/user-123\//);
    expect(response.body.publicUrl).toContain('/api/uploads/public/booth-logo/');
  });

  test('rejects scripted SVG that becomes empty after sanitization', async () => {
    const dirty = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      'utf8'
    );
    const response = await request(app)
      .post('/api/uploads/svg-logo')
      .field('fileType', 'image')
      .attach('file', dirty, {
        filename: 'evil.svg',
        contentType: 'image/svg+xml'
      });

    expect(response.status).toBe(400);
    expect(response.body.message || response.body.error).toMatch(/drawable|Invalid SVG|rejected/i);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  test('rejects non-SVG uploads', async () => {
    const response = await request(app)
      .post('/api/uploads/svg-logo')
      .field('fileType', 'image')
      .attach('file', Buffer.from('not-an-image'), {
        filename: 'note.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(400);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  test('rejects invalid fileType values', async () => {
    const response = await request(app)
      .post('/api/uploads/svg-logo')
      .field('fileType', 'resume')
      .attach('file', safeSvg, {
        filename: 'logo.svg',
        contentType: 'image/svg+xml'
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/fileType/i);
    expect(mockPutObject).not.toHaveBeenCalled();
  });

  test('presign still rejects image/svg+xml for raster image path', async () => {
    const response = await request(app)
      .post('/api/uploads/presign')
      .send({
        fileName: 'logo.svg',
        fileType: 'image',
        mimeType: 'image/svg+xml'
      });

    expect(response.status).toBe(400);
    // Rejected either by MIME format validation (+) or by the raster allowlist.
    expect(['Invalid file type', 'Validation failed']).toContain(response.body.error);
  });

  test('presign still accepts image/png', async () => {
    const response = await request(app)
      .post('/api/uploads/presign')
      .send({
        fileName: 'logo.png',
        fileType: 'image',
        mimeType: 'image/png'
      });

    expect(response.status).toBe(200);
    expect(response.body.upload.key).toMatch(/^image\/user-123\//);
    expect(mockGetSignedUrl).toHaveBeenCalled();
  });

  test('accepts SVG with empty/missing MIME when filename ends with .svg', async () => {
    const response = await request(app)
      .post('/api/uploads/svg-logo')
      .field('fileType', 'image')
      .attach('file', safeSvg, {
        filename: 'logo.svg',
        contentType: 'application/octet-stream'
      });

    expect(response.status).toBe(200);
    expect(response.body.publicUrl).toContain('/api/uploads/public/image/');
  });
});
