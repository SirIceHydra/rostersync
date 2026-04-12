import express from 'express';
import cors from 'cors';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.GATEWAY_PORT || 4000;

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// DO NOT use express.json() for proxied routes - it consumes the body!
// Only parse JSON for non-proxied routes like health check
app.get('/health', express.json(), (req, res) => {
  res.json({ status: 'ok', services: ['auth', 'roster', 'request', 'user', 'analytics'] });
});

// Common proxy options
const createProxy = (port: number): Options => ({
  target: `http://localhost:${port}`,
  changeOrigin: true,
  timeout: 30000,
  proxyTimeout: 30000,
  onError: (err, req, res) => {
    console.error(`Proxy error for ${req.url}:`, err.message);
    if (!res.headersSent) {
      (res as express.Response).status(502).json({ error: 'Service unavailable', details: err.message });
    }
  }
});

// Proxy to services
app.use('/api/auth', createProxyMiddleware(createProxy(Number(process.env.AUTH_SERVICE_PORT) || 4001)));
app.use('/api/rosters', createProxyMiddleware(createProxy(Number(process.env.ROSTER_SERVICE_PORT) || 4002)));
app.use('/api/requests', createProxyMiddleware(createProxy(Number(process.env.REQUEST_SERVICE_PORT) || 4003)));
app.use('/api/users', createProxyMiddleware(createProxy(Number(process.env.USER_SERVICE_PORT) || 4004)));
app.use('/api/analytics', createProxyMiddleware(createProxy(Number(process.env.ANALYTICS_SERVICE_PORT) || 4005)));

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`   Auth: http://localhost:${process.env.AUTH_SERVICE_PORT || 4001}`);
  console.log(`   Roster: http://localhost:${process.env.ROSTER_SERVICE_PORT || 4002}`);
  console.log(`   Request: http://localhost:${process.env.REQUEST_SERVICE_PORT || 4003}`);
  console.log(`   User: http://localhost:${process.env.USER_SERVICE_PORT || 4004}`);
  console.log(`   Analytics: http://localhost:${process.env.ANALYTICS_SERVICE_PORT || 4005}`);
});
