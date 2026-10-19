const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/schema');

// Student self-registration
router.post('/register', (req, res) => {
  const { name, enrolment_number, programme, semester, email, phone, username, password } = req.body;
  if (!name || !enrolment_number || !programme || !semester || !username || !password) {
    return res.status(400).json({ error: 'All required fields must be filled' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) return res.status(400).json({ error: 'Username is already taken' });

  const existingEnrol = db.prepare('SELECT id FROM students WHERE enrolment_number = ?').get(enrolment_number);
  if (existingEnrol) return res.status(400).json({ error: 'Enrolment number already registered' });

  const hash = bcrypt.hashSync(password, 10);
  const userResult = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?,?,?)').run(username, hash, 'student');
  db.prepare('INSERT INTO students (user_id, name, enrolment_number, programme, semester, email, phone) VALUES (?,?,?,?,?,?,?)').run(
    userResult.lastInsertRowid, name, enrolment_number, programme, parseInt(semester), email || null, phone || null
  );

  res.json({ success: true, message: 'Registration successful! You can now log in.' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  let profile = null;
  if (user.role === 'student') {
    profile = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
  }

  req.session.user = { id: user.id, username: user.username, role: user.role, profile };
  res.json({ success: true, role: user.role, username: user.username, profile });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
});

module.exports = router;
