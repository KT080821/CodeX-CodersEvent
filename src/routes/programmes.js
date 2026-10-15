const express = require('express');
const router = express.Router();
const db = require('../db/schema');

function requireCoordinator(req, res, next) {
  if (!['coordinator', 'ADMIN'].includes(req.session.user.role)) return res.status(403).json({ error: 'Access denied' });
  next();
}

// List all programmes (public — needed for registration dropdown)
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM programmes ORDER BY name').all();
  res.json(rows);
});

// Add programme
router.post('/', requireCoordinator, (req, res) => {
  const { name, duration_semesters } = req.body;
  if (!name) return res.status(400).json({ error: 'Programme name is required' });
  const existing = db.prepare('SELECT id FROM programmes WHERE name = ?').get(name);
  if (existing) return res.status(400).json({ error: 'Programme already exists' });
  const result = db.prepare('INSERT INTO programmes (name, duration_semesters) VALUES (?,?)').run(name, duration_semesters || 4);
  res.json({ success: true, id: result.lastInsertRowid });
});

// Update programme
router.put('/:id', requireCoordinator, (req, res) => {
  const { name, duration_semesters } = req.body;
  if (!name) return res.status(400).json({ error: 'Programme name is required' });
  db.prepare('UPDATE programmes SET name=?, duration_semesters=? WHERE id=?').run(name, duration_semesters || 4, req.params.id);
  res.json({ success: true });
});

// Delete programme
router.delete('/:id', requireCoordinator, (req, res) => {
  db.prepare('DELETE FROM programmes WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
