const express = require('express');
const router = express.Router();
const db = require('../db/schema');

function requireCoordinator(req, res, next) {
  if (req.session.user.role !== 'coordinator') return res.status(403).json({ error: 'Access denied' });
  next();
}

// Summary dashboard
router.get('/summary', requireCoordinator, (req, res) => {
  const items = db.prepare('SELECT * FROM inventory_items').all();
  const totalIssued = db.prepare('SELECT COUNT(*) as c FROM issue_records WHERE status IN (\'issued\',\'overdue\')').get().c;
  const overdue = db.prepare('SELECT COUNT(*) as c FROM issue_records WHERE status = \'overdue\'').get().c;
  const pendingRenewals = db.prepare('SELECT COUNT(*) as c FROM renewal_requests WHERE status = \'pending\'').get().c;
  const totalStudents = db.prepare('SELECT COUNT(*) as c FROM students').get().c;
  res.json({ items, totalIssued, overdue, pendingRenewals, totalStudents });
});

// Overdue list
router.get('/overdue', (req, res) => {
  const user = req.session.user;
  let q = `
    SELECT ir.*, s.name as student_name, s.enrolment_number, s.programme, s.semester, s.email, s.phone,
           i.name as item_name, i.item_code, a.asset_id as asset_code,
           CAST((julianday('now') - julianday(ir.due_date)) AS INTEGER) as overdue_days
    FROM issue_records ir
    JOIN students s ON ir.student_id = s.id
    JOIN inventory_items i ON ir.item_id = i.id
    LEFT JOIN individual_assets a ON ir.asset_id = a.id
    WHERE ir.due_date < date('now') AND ir.status IN ('issued','overdue')
  `;
  if (user.role === 'student') {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(user.id);
    if (!student) return res.json([]);
    q += ` AND ir.student_id = ${student.id}`;
  }
  q += ' ORDER BY ir.due_date ASC';
  const rows = db.prepare(q).all();
  // Auto-mark overdue
  rows.forEach(r => { db.prepare('UPDATE issue_records SET status=\'overdue\' WHERE id=?').run(r.id); });
  res.json(rows);
});

// Upcoming due (within 3 days)
router.get('/upcoming', (req, res) => {
  const user = req.session.user;
  let q = `
    SELECT ir.*, s.name as student_name, s.enrolment_number,
           i.name as item_name, i.item_code, a.asset_id as asset_code,
           CAST((julianday(ir.due_date) - julianday('now')) AS INTEGER) as days_until_due
    FROM issue_records ir
    JOIN students s ON ir.student_id = s.id
    JOIN inventory_items i ON ir.item_id = i.id
    LEFT JOIN individual_assets a ON ir.asset_id = a.id
    WHERE ir.due_date >= date('now') AND ir.due_date <= date('now', '+3 days') AND ir.status = 'issued'
  `;
  if (user.role === 'student') {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(user.id);
    if (!student) return res.json([]);
    q += ` AND ir.student_id = ${student.id}`;
  }
  q += ' ORDER BY ir.due_date ASC';
  res.json(db.prepare(q).all());
});

// Student-wise view
router.get('/by-student/:student_id', requireCoordinator, (req, res) => {
  const rows = db.prepare(`
    SELECT ir.*, i.name as item_name, i.item_code, a.asset_id as asset_code,
           u.username as issued_by_name
    FROM issue_records ir
    JOIN inventory_items i ON ir.item_id = i.id
    LEFT JOIN individual_assets a ON ir.asset_id = a.id
    JOIN users u ON ir.issued_by = u.id
    WHERE ir.student_id = ?
    ORDER BY ir.issue_date DESC
  `).all(req.params.student_id);
  res.json(rows);
});

// Item-wise view
router.get('/by-item/:item_id', requireCoordinator, (req, res) => {
  const rows = db.prepare(`
    SELECT ir.*, s.name as student_name, s.enrolment_number, a.asset_id as asset_code
    FROM issue_records ir
    JOIN students s ON ir.student_id = s.id
    LEFT JOIN individual_assets a ON ir.asset_id = a.id
    WHERE ir.item_id = ?
    ORDER BY ir.issue_date DESC
  `).all(req.params.item_id);
  res.json(rows);
});

// Programme-wise view
router.get('/by-programme', requireCoordinator, (req, res) => {
  const rows = db.prepare(`
    SELECT s.programme, s.semester, COUNT(ir.id) as total_issues,
           COUNT(CASE WHEN ir.status IN ('issued','overdue') THEN 1 END) as active,
           COUNT(CASE WHEN ir.status = 'overdue' THEN 1 END) as overdue
    FROM issue_records ir
    JOIN students s ON ir.student_id = s.id
    GROUP BY s.programme, s.semester ORDER BY s.programme, s.semester
  `).all();
  res.json(rows);
});

// Audit log
router.get('/audit', requireCoordinator, (req, res) => {
  const rows = db.prepare(`
    SELECT al.*, u.username FROM audit_log al LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.timestamp DESC LIMIT 200
  `).all();
  res.json(rows);
});

// Stock adjustments history
router.get('/adjustments', requireCoordinator, (req, res) => {
  const rows = db.prepare(`
    SELECT sa.*, i.name as item_name, u.username as adjusted_by_name
    FROM stock_adjustments sa
    JOIN inventory_items i ON sa.item_id = i.id
    JOIN users u ON sa.adjusted_by = u.id
    ORDER BY sa.created_at DESC
  `).all();
  res.json(rows);
});

module.exports = router;
