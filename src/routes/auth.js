const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db/schema');
const { csrfToken, createRateLimiter, validateText } = require('../security');

const router = express.Router();
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many authentication attempts for this account. Please try again later.',
  keyGenerator: req => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const username = typeof req.body?.username === 'string'
      ? req.body.username.trim().toLowerCase()
      : 'unknown';
    return `${ip}:${username}`;
  }
});
const REGISTRATION_PROGRAMMES = new Set(['Btech CSE', 'Btech Civil', 'Msc DFIS', 'Mtech Cyber']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function baseUrl(req) {
  return process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function validateRegistration(data) {
  const { name, enrolment_number, programme, semester, email, username, password } = data;
  if (!name || !enrolment_number || !programme || !semester || !username || !password || !email) {
    return 'All required fields must be filled';
  }
  const textError = validateText(username, 'Username', { min: 3, max: 40 }) ||
    validateText(name, 'Name', { max: 100 }) ||
    validateText(enrolment_number, 'Enrolment number', { max: 40 });
  if (textError) return textError;
  if (!REGISTRATION_PROGRAMMES.has(programme)) return 'Please select a valid programme';
  if (!EMAIL_PATTERN.test(email) || email.length > 160) return 'Please enter a valid email address';
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    return 'Password must be between 10 and 128 characters';
  }
  return null;
}

async function createStudentAccount(req, data, { verified = false, googleSub = null } = {}) {
  const error = validateRegistration(data);
  if (error) return { error };
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(data.username, data.email);
  if (existingUser) return { error: 'Username or email is already registered' };
  if (db.prepare('SELECT id FROM students WHERE enrolment_number = ?').get(data.enrolment_number)) {
    return { error: 'Enrolment number already registered' };
  }

  const hash = bcrypt.hashSync(data.password, 10);
  db.prepare('INSERT INTO users (username, password_hash, role, email, email_verified, google_sub) VALUES (?,?,?,?,?,?)')
    .run(data.username, hash, 'student', data.email, 1, googleSub);
  const user = db.prepare('SELECT id FROM users WHERE username = ?').get(data.username);
  db.prepare('INSERT INTO students (user_id, name, enrolment_number, programme, semester, email, phone) VALUES (?,?,?,?,?,?,?)')
    .run(user.id, data.name, data.enrolment_number, data.programme, parseInt(data.semester, 10), data.email, data.phone || null);
  return { userId: user.id };
}

router.get('/csrf', (req, res) => res.json({ token: csrfToken(req) }));
router.get('/google/config', (req, res) => {
  res.json({ enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) });
});

router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Google signup is not configured yet.');
  }
  const state = crypto.randomBytes(24).toString('hex');
  req.session.googleOAuthState = state;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  if (!req.query.code || req.query.state !== req.session.googleOAuthState) return res.status(400).send('Invalid Google sign-in request.');
  delete req.session.googleOAuthState;
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${baseUrl(req)}/api/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) throw new Error('Google token exchange failed');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) throw new Error('Google email is not verified');
    const user = db.prepare('SELECT * FROM users WHERE google_sub = ? OR email = ?').get(profile.sub, profile.email);
    if (user) {
      db.prepare('UPDATE users SET google_sub = ?, email = ?, email_verified = 1 WHERE id = ?').run(profile.sub, profile.email, user.id);
      return loginUser(req, res, user.id);
    }
    req.session.googleProfile = { sub: profile.sub, email: profile.email, name: profile.name || '' };
    res.redirect('/?oauth=complete');
  } catch (err) {
    console.error('Google OAuth failed:', err.message);
    res.status(502).send('Google sign-in could not be completed.');
  }
});

router.post('/register/google', authLimiter, async (req, res) => {
  const profile = req.session.googleProfile;
  if (!profile) return res.status(400).json({ error: 'Google registration session expired' });
  const result = await createStudentAccount(req, { ...req.body, email: profile.email }, { verified: true, googleSub: profile.sub });
  if (result.error) return res.status(400).json({ error: result.error });
  delete req.session.googleProfile;
  loginUser(req, res, result.userId);
});

function loginUser(req, res, userId) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(403).json({ error: 'Account is not available' });
  const profile = user.role === 'student' ? db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id) : null;
  const sessionUser = { id: user.id, username: user.username, role: user.role, profile };
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Could not create a secure session' });
    req.session.user = sessionUser;
    res.json({ success: true, role: user.role, username: user.username, profile });
  });
}

router.post('/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  db.prepare('INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)')
    .run(user ? user.id : null, 'LOGIN_SUCCESS', 'authentication', user ? user.id : null, `Successful login for ${username}`);
  loginUser(req, res, user.id);
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: 'Could not sign out' });
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
});

module.exports = router;
