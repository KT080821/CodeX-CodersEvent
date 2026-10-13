const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

app.use(session({
  secret: 'inventory-sys-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/programmes', require('./routes/programmes'));
app.use('/api/students', requireAuth, require('./routes/students'));
app.use('/api/inventory', requireAuth, require('./routes/inventory'));
app.use('/api/issues', requireAuth, require('./routes/issues'));
app.use('/api/returns', requireAuth, require('./routes/returns'));
app.use('/api/renewals', requireAuth, require('./routes/renewals'));
app.use('/api/reports', requireAuth, require('./routes/reports'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Initialize DB then start server
const { initDb } = require('./db/schema');
initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`\n✅ Department Inventory System running at http://localhost:${PORT}`);
    console.log(`\n📋 Demo Credentials:`);
    console.log(`   Coordinator  → username: coordinator  | password: coord123`);
    console.log(`   Student 1    → username: student001   | password: student123`);
    console.log(`   Student 2    → username: student002   | password: student123`);
    console.log(`   Student 3    → username: student003   | password: student123\n`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
