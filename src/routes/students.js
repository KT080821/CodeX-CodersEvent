const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/schema');

function requireCoordinator(req, res, next) {
  if (!['coordinator', 'ADMIN'].includes(req.session.user.role)) return res.status(403).json({ error: 'Access denied' });
  next();
}

// List all students
router.get('/', requireCoordinator, (req, res) => {
  const students = db.prepare(`
    SELECT s.*, u.username FROM students s LEFT JOIN users u ON s.user_id = u.id ORDER BY s.name
  `).all();
  res.json(students);
});

// Get single student
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const user = req.session.user;
  let student;
  if (['coordinator', 'ADMIN'].includes(user.role)) {
    student = db.prepare('SELECT s.*, u.username FROM students s LEFT JOIN users u ON s.user_id = u.id WHERE s.id = ?').get(id);
  } else {
    student = db.prepare('SELECT s.*, u.username FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.user_id = ?').get(id, user.id);
  }
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(student);
});

// Add student
router.post('/', requireCoordinator, (req, res) => {
  const { name, enrolment_number, programme, semester, email, phone, username, password } = req.body;
  if (!name || !enrolment_number || !programme || !semester || !username || !password) {
    return res.status(400).json({ error: 'Required fields missing' });
  }
  const existing = db.prepare('SELECT id FROM students WHERE enrolment_number = ?').get(enrolment_number);
  if (existing) return res.status(400).json({ error: 'Enrolment number already exists' });

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) return res.status(400).json({ error: 'Username already taken' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)').run(username, hash, 'student');
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  const studentResult = db.prepare('INSERT INTO students (user_id, name, enrolment_number, programme, semester, email, phone) VALUES (?,?,?,?,?,?,?)').run(
    user.id, name, enrolment_number, programme, semester, email || null, phone || null
  );
  db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)').run(
    req.session.user.id, 'CREATE', 'student', studentResult.lastInsertRowid, `Added student ${name} (${enrolment_number})`
  );
  res.json({ success: true, id: studentResult.lastInsertRowid });
});

// Update student
router.put('/:id', requireCoordinator, (req, res) => {
  const { name, programme, semester, email, phone } = req.body;
  db.prepare('UPDATE students SET name=?, programme=?, semester=?, email=?, phone=? WHERE id=?').run(name, programme, semester, email, phone, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', requireCoordinator, (req, res) => {
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const active = db.prepare("SELECT id FROM issue_records WHERE student_id = ? AND status IN ('issued','overdue')").get(student.id);
  if (active) return res.status(400).json({ error: 'Cannot delete a student with active issued items' });
  db.transaction(() => {
    db.prepare('DELETE FROM return_records WHERE issue_id IN (SELECT id FROM issue_records WHERE student_id = ?)').run(student.id);
    db.prepare('DELETE FROM renewal_requests WHERE issue_id IN (SELECT id FROM issue_records WHERE student_id = ?)').run(student.id);
    db.prepare('DELETE FROM issue_records WHERE student_id = ?').run(student.id);
    db.prepare('DELETE FROM issue_requests WHERE student_id = ?').run(student.id);
    db.prepare('DELETE FROM students WHERE id = ?').run(student.id);
    if (student.user_id) db.prepare('DELETE FROM users WHERE id = ?').run(student.user_id);
  });
  res.json({ success: true });
});

module.exports = router;
