const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createRateLimiter, csrfProtection } = require('./security');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) return;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || (!isProduction ? crypto.randomBytes(32).toString('hex') : null);

if (!sessionSecret) throw new Error('SESSION_SECRET must be set in production');
app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);

// Middleware
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});
app.use(express.json({ limit: '100kb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  if (isProduction) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(createRateLimiter({ windowMs: 15 * 60 * 1000, max: 300, message: 'Too many requests. Please try again later.' }));
app.use((req, res, next) => {
  if (isProduction && !req.secure && req.path !== '/health') {
    return res.redirect(`https://${req.get('host')}${req.originalUrl}`);
  }
  next();
});

// Session
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true,
    // OAuth returns to this app from accounts.google.com; Lax preserves the
    // session cookie on that top-level callback while blocking cross-site
    // subrequests.
    sameSite: 'lax',
    secure: isProduction
  }
}));
app.use(csrfProtection);

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'inventory-system' }));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', requireAuth, require('./routes/users'));
app.use('/api/programmes', require('./routes/programmes'));
app.use('/api/students', requireAuth, require('./routes/students'));
app.use('/api/inventory', requireAuth, require('./routes/inventory'));
app.use('/api/issues', requireAuth, require('./routes/issues'));
app.use('/api/returns', requireAuth, require('./routes/returns'));
app.use('/api/renewals', requireAuth, require('./routes/renewals'));
app.use('/api/reports', requireAuth, require('./routes/reports'));
app.use('/api/issue-requests', requireAuth, require('./routes/issue-requests'));

// Never serve the SPA shell for an unknown API endpoint.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use((err, req, res, next) => {
  console.error(`[${req.id || 'request'}]`, err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: isProduction ? 'Internal server error' : err.message });
});

// Initialize DB then start server
const { initDb } = require('./db/schema');
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅ Department Inventory System running at http://localhost:${PORT}`);
    if (process.env.SEED_DEMO_DATA === 'true') {
      console.log('Demo data seeding is enabled for this environment.');
    }
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
