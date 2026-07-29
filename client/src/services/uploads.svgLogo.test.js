jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

import axios from 'axios';
import { uploadImageToS3, uploadBoothLogoToS3 } from '../services/uploads';

describe('uploads service SVG routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('token', 'test-token');
    global.fetch = jest.fn();
  });

  afterEach(() => {
    localStorage.clear();
    delete global.fetch;
  });

  test('uploadImageToS3 routes SVG through sanitized multipart endpoint', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        key: 'image/user/logo.svg',
        publicUrl: '/api/uploads/public/image/user/logo.svg',
      },
    });

    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>'],
      'logo.svg',
      { type: 'image/svg+xml' }
    );

    const result = await uploadImageToS3(file, { variant: 'public' });

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post.mock.calls[0][0]).toBe('/api/uploads/svg-logo');
    expect(axios.post.mock.calls[0][1]).toBeInstanceOf(FormData);
    expect(result.downloadUrl).toBe('/api/uploads/public/image/user/logo.svg');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('uploadImageToS3 routes empty-MIME .svg through sanitizer', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        key: 'image/user/logo.svg',
        publicUrl: '/api/uploads/public/image/user/logo.svg',
      },
    });

    const file = new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'], 'logo.svg', {
      type: '',
    });

    await uploadImageToS3(file, { variant: 'public' });
    expect(axios.post.mock.calls[0][0]).toBe('/api/uploads/svg-logo');
  });

  test('uploadBoothLogoToS3 routes SVG through sanitizer with booth-logo type', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        key: 'booth-logo/user/logo.svg',
        publicUrl: '/api/uploads/public/booth-logo/user/logo.svg',
      },
    });

    const file = new File(
      ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>'],
      'booth.svg',
      { type: 'image/svg+xml' }
    );

    const result = await uploadBoothLogoToS3(file);
    expect(axios.post.mock.calls[0][0]).toBe('/api/uploads/svg-logo');
    const formData = axios.post.mock.calls[0][1];
    expect(formData.get('fileType')).toBe('booth-logo');
    expect(result.downloadUrl).toContain('/api/uploads/public/booth-logo/');
  });

  test('uploadImageToS3 keeps PNG on presign path', async () => {
    axios.post
      .mockResolvedValueOnce({
        data: {
          upload: { url: 'https://s3.example/put', key: 'image/user/logo.png' },
        },
      })
      .mockResolvedValueOnce({ data: { file: {} } });

    global.fetch.mockResolvedValueOnce({ ok: true });

    const file = new File(['png-bytes'], 'logo.png', { type: 'image/png' });
    const result = await uploadImageToS3(file, { variant: 'public' });

    expect(axios.post.mock.calls[0][0]).toBe('/api/uploads/presign');
    expect(axios.post.mock.calls[0][1]).toEqual({
      fileName: 'logo.png',
      fileType: 'image',
      mimeType: 'image/png',
    });
    expect(global.fetch).toHaveBeenCalled();
    expect(result.downloadUrl).toBe('/api/uploads/public/image/user/logo.png');
  });

  test('propagates sanitizer error message from server', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { message: 'SVG logo has no drawable content after sanitization' } },
    });

    const file = new File(['<svg></svg>'], 'bad.svg', { type: 'image/svg+xml' });
    await expect(uploadImageToS3(file)).rejects.toMatchObject({
      response: { data: { message: expect.stringMatching(/drawable/i) } },
    });
  });
});
