/**
 * CRA dev-server middleware.
 * Webpack HMR, Syncfusion RTE, and Twilio Video require `unsafe-eval` in development.
 * Without an explicit CSP that allows it, Chrome reports CSP eval violations in Issues.
 */
module.exports = function setupProxy(app) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  const devContentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "connect-src 'self' http://localhost:5000 ws://localhost:5000 ws://localhost:3000 http://localhost:3000 https: wss: ws:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' https://fonts.gstatic.com data:",
    "worker-src 'self' blob:",
    "frame-src 'self' https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com https://youtube-nocookie.com https://player.vimeo.com https://www.instagram.com https://www.facebook.com https://www.linkedin.com https://www.tiktok.com",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');

  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', devContentSecurityPolicy);
    next();
  });
};
