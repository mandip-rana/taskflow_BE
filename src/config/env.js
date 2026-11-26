require('dotenv').config({ quiet: true });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

if (isProduction && !process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI must be set when NODE_ENV=production');
}

const env = {
  nodeEnv,
  isProduction,
  port: toPositiveInt(process.env.PORT, 5000),
  mongoUri: process.env.MONGODB_URI,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Set to 1 when running behind a reverse proxy so rate limiting sees the real client IP.
  trustProxy: toPositiveInt(process.env.TRUST_PROXY, 0),
  rateLimit: {
    windowMs: toPositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: toPositiveInt(process.env.RATE_LIMIT_MAX, 100),
  },
  shutdownTimeoutMs: toPositiveInt(process.env.SHUTDOWN_TIMEOUT_MS, 10000),
};

module.exports = env;
