import express from 'express';
import cors from 'cors';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { logger } from '../shared/logger.js';
import { corsOrigin } from '../shared/corsOrigin.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.GATEWAY_PORT || 4000;

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  next();
});

app.use(cors({ origin: corsOrigin(), credentials: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', express.json(), (_req, res) => {
  res.json({ status: 'ok', services: ['auth', 'roster', 'request', 'user', 'analytics'] });
});

// ── Proxy factory ─────────────────────────────────────────────────────────────
const createProxy = (port: number): Options => ({
  target: `http://localhost:${port}`,
  changeOrigin: true,
  timeout: 30000,
  proxyTimeout: 30000,
  onError: (err: Error, req: express.Request, res: express.Response) => {
    logger.error({ err, url: req.url }, 'Proxy error');
    if (!res.headersSent) {
      res.status(502).json({ error: 'Service unavailable' });
    }
  },
});

// ── Route to services ─────────────────────────────────────────────────────────
app.use('/api/auth',      createProxyMiddleware(createProxy(Number(process.env.AUTH_SERVICE_PORT)      || 4001)));
app.use('/api/rosters',   createProxyMiddleware(createProxy(Number(process.env.ROSTER_SERVICE_PORT)    || 4002)));
app.use('/api/requests',  createProxyMiddleware(createProxy(Number(process.env.REQUEST_SERVICE_PORT)   || 4003)));
app.use('/api/users',     createProxyMiddleware(createProxy(Number(process.env.USER_SERVICE_PORT)      || 4004)));
app.use('/api/analytics', createProxyMiddleware(createProxy(Number(process.env.ANALYTICS_SERVICE_PORT) || 4005)));

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
});
