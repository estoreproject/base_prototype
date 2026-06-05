const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const logger = require('./logger');
const store = require('./store');

const app = express();

store.load();
const snapshotUrl = store.getSnapshotUrl();
if (snapshotUrl) logger.info({ url: snapshotUrl }, 'client snapshot URL');

const supabaseOrigin = (process.env.SUPABASE_URL || '').replace(/\/+$/, '').toLowerCase();
const imgSrc = ["'self'", "data:", "blob:"];
if (supabaseOrigin) imgSrc.push(supabaseOrigin);

const corsOrigin = (process.env.CORS_ORIGIN || '*').replace(/\/+$/, '').toLowerCase();
app.use(cors({
  origin: (origin, cb) => {
    if (corsOrigin === '*' || !origin) return cb(null, true);
    cb(null, corsOrigin === origin.replace(/\/+$/, '').toLowerCase());
  }
}));
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc } }, hsts: { maxAge: 31536000, preload: true } }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

/* --- Rate limiters (per IP) --- */
// Client-facing: 300 req/min (50 users behind one IP → ~6 req/min each)
const clientLimiter = rateLimit({ windowMs: 60000, max: 300, standardHeaders: true, legacyHeaders: false });
// Order submission: 30 req/min (anti-spam, 50 users → 1 order/100s each)
const orderLimiter = rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false });
// Admin API: 120 req/min
const adminLimiter = rateLimit({ windowMs: 60000, max: 120, standardHeaders: true, legacyHeaders: false });
// Login brute-force: 10 req/min
const loginLimiter = rateLimit({ windowMs: 60000, max: 10, standardHeaders: true, legacyHeaders: false });

const envAdminHash = process.env.ADMIN_PASSWORD
  ? crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest('hex')
  : null;

async function getStoredAdminHash() {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const url = (process.env.SUPABASE_URL || '').trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
    if (url && key) {
      const client = createClient(url, key);
      const { data: rows } = await client.from('admin_settings').select('password_hash').eq('id', 1).limit(1);
      if (rows?.[0]?.password_hash) return rows[0].password_hash;
    }
  } catch {}
  return envAdminHash;
}

function requireAdmin(req, res, next) {
  getStoredAdminHash().then(storedHash => {
    if (!storedHash) return next();
    if (req.cookies.admin_token === storedHash) return next();
    logger.warn({ ip: req.ip, url: req.originalUrl }, 'unauthorized admin access attempt');
    res.status(401).json({ error: 'Unauthorized' });
  }).catch(() => next());
}

app.post('/admin/login', async (req, res) => {
  const { password } = req.body || {};
  const storedHash = await getStoredAdminHash();
  if (!storedHash) return res.json({ ok: true });
  if (!password || crypto.createHash('sha256').update(password).digest('hex') !== storedHash) {
    logger.warn({ ip: req.ip }, 'failed admin login attempt');
    return res.status(401).json({ error: 'Invalid password' });
  }
  res.cookie('admin_token', storedHash, { httpOnly: true, sameSite: 'strict', maxAge: 86400000 });
  res.json({ ok: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/snapshot-url', (req, res) => {
  const url = store.getSnapshotUrl();
  res.json({ url: url || null });
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({ method: req.method, url: req.originalUrl, status: res.statusCode, ms: Date.now() - start }, 'request');
  });
  next();
});

const apiRoute = require('./api/route');
const adminRoute = require('./admin/route');

/* Apply rate limiters before route handlers */
app.use('/api/data', clientLimiter);
app.use('/api/order', orderLimiter);
app.use('/admin/api', requireAdmin, adminLimiter);
app.post('/admin/login', loginLimiter);

// Global catch-all limiter (middleware, health, snapshot, etc.)
app.use(clientLimiter);

app.use('/api', apiRoute);
app.use('/admin/api', adminRoute);

/* Serve /admin path explicitly first (avoids Express 5 trailing-slash redirect) */
const adminIndex = path.join(__dirname, 'admin', 'index.html');
app.get('/admin', (req, res) => res.sendFile(adminIndex));
app.get('/admin/', (req, res) => res.sendFile(adminIndex));
app.use('/admin', express.static(path.join(__dirname, 'admin'), { index: 'index.html' }));
app.use('/', express.static(path.join(__dirname, 'client')));

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) logger.error(err, 'unhandled error');
  else logger.warn({ err: err.message }, 'request error');
  res.status(status).json({ error: err.message || 'Internal server error' });
});

module.exports = app;
