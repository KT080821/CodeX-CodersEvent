const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/schema');

const router = express.Router();
function requireAdmin(req, res, next) {
  if (req.session.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin access required' });
  next();
}

router.use(requireAdmin);

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT id, username, role, email, created_at FROM users ORDER BY role, username').all());
});

router.post('/', (req, res) => {
  const { username, password, role, name, enrolment_number, programme, semester, email, phone } = req.body;
  if (!username || !password || !['ADMIN', 'coordinator', 'student'].includes(role)) return res.status(400).json({ error: 'Username, password, and valid role are required' });
  if (role === 'student' && (!name || !enrolment_number || !programme || !semester)) return res.status(400).json({ error: 'Student profile fields are required' });
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) return res.status(400).json({ error: 'Username already taken' });
  if (role === 'student' && db.prepare('SELECT id FROM students WHERE enrolment_number = ?').get(enrolment_number)) return res.status(400).json({ error: 'Enrolment number already exists' });
  const result = db.prepare('INSERT INTO users (username, password_hash, role, email, email_verified) VALUES (?,?,?,?,1)')
    .run(username, bcrypt.hashSync(password, 10), role, email || null);
  if (role === 'student') {
    db.prepare('INSERT INTO students (user_id, name, enrolment_number, programme, semester, email, phone) VALUES (?,?,?,?,?,?,?)')
      .run(result.lastInsertRowid, name, enrolment_number, programme, semester, email || null, phone || null);
  }
  res.json({ success: true, id: result.lastInsertRowid });
});

router.delete('/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.session.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
  if (user.role === 'ADMIN' && db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'").get().count <= 1) return res.status(400).json({ error: 'At least one admin account must remain' });
  const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(user.id);
  if (student && db.prepare("SELECT id FROM issue_records WHERE student_id = ? AND status IN ('issued','overdue')").get(student.id)) return res.status(400).json({ error: 'Cannot delete a student with active issued items' });
  if (student) {
    db.transaction(() => {
      db.prepare('DELETE FROM return_records WHERE issue_id IN (SELECT id FROM issue_records WHERE student_id = ?)').run(student.id);
      db.prepare('DELETE FROM renewal_requests WHERE issue_id IN (SELECT id FROM issue_records WHERE student_id = ?)').run(student.id);
      db.prepare('DELETE FROM issue_records WHERE student_id = ?').run(student.id);
      db.prepare('DELETE FROM issue_requests WHERE student_id = ?').run(student.id);
      db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    });
  } else {
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  }
  res.json({ success: true });
});

module.exports = router;
