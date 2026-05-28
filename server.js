'use strict';
try { require('dotenv').config(); } catch {}

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const fs = require('fs');
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── JWT secret enforcement ──
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'classmind-secret-key-change-in-prod') {
  if (IS_PROD) {
    console.error('FATAL: JWT_SECRET env var must be set to a random secret in production.');
    process.exit(1);
  }
}
const _JWT = JWT_SECRET || 'classmind-dev-only-secret-not-for-prod';

// ── Email client ──
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FROM_EMAIL = process.env.FROM_EMAIL || 'ClassMind AI <noreply@classmind.app>';
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendEmail(to, subject, html) {
  if (!resend) return; // Email silently skipped if not configured
  try { await resend.emails.send({ from: FROM_EMAIL, to, subject, html }); } catch (e) { console.error('Email error:', e.message); }
}

// ── Database setup ──
const DB_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
const db = new Database(path.join(DB_DIR, 'classmind.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    university TEXT DEFAULT '',
    level TEXT DEFAULT '',
    department TEXT DEFAULT '',
    courses TEXT DEFAULT '[]',
    onboarded INTEGER DEFAULT 0,
    email_verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    analysis_id INTEGER,
    subject TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    deadline TEXT DEFAULT 'No deadline',
    priority TEXT DEFAULT 'MEDIUM',
    details TEXT DEFAULT '',
    status TEXT DEFAULT 'todo',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    remind_at TEXT NOT NULL,
    triggered INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    source_type TEXT DEFAULT 'custom',
    source_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    rating INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);

// Migrations for existing deployments
try { db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE reminders ADD COLUMN enabled INTEGER DEFAULT 1'); } catch {}

// ── Security middleware ──
app.set('trust proxy', 1); // Railway / reverse proxy

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // inline scripts used in HTML pages
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    }
  }
}));

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000'];

app.use(cors({ origin: allowedOrigins, credentials: true }));

// Auth rate limiter: 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.' }
});

// AI rate limiter: 30 requests per hour keyed by user id or IP
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id?.toString() || req.ip,
  message: { error: 'Too many AI requests. Please wait an hour and try again.' }
});

// General API limiter: 200 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth', authLimiter);
app.use('/api/analyze', aiLimiter);
app.use('/api/chat', aiLimiter);
app.use('/api', generalLimiter);

// ── Auth middleware ──
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    req.user = jwt.verify(token, _JWT);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function optionalAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token) {
    try { req.user = jwt.verify(token, _JWT); } catch {}
  }
  next();
}

// ── File upload: MIME whitelist, 25MB limit ──
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'audio/mpeg', 'audio/wav', 'audio/mp4', 'video/mp4', 'video/quicktime',
  'audio/x-m4a', 'audio/ogg'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  }
});

let anthropic;
function getClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured.');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function apiErr(res, err) {
  console.error(err?.message || err);
  const msg = IS_PROD ? 'Something went wrong. Please try again.' : (err?.message || 'Unknown error');
  return res.status(500).json({ error: msg });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// ── Health check ──
app.get('/health', (req, res) => res.json({ ok: true, uptime: Math.floor(process.uptime()) }));

// ────────────────────────────────────────────
// AUTH ROUTES
// ────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const norm = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(norm)) return res.status(400).json({ error: 'Invalid email address.' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(norm);
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name.trim(), norm, hash);
    const userId = result.lastInsertRowid;
    const user = { id: userId, name: name.trim(), email: norm, onboarded: 0, email_verified: 0, university: '', level: '', department: '', courses: [] };
    const token = jwt.sign({ id: userId }, _JWT, { expiresIn: '7d' });

    // Send verification email (non-blocking)
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 3600000).toISOString();
    db.prepare('INSERT OR REPLACE INTO email_verifications (user_id, token, expires_at) VALUES (?,?,?)').run(userId, verifyToken, expires);
    const link = `${APP_URL}/verify-email.html?token=${verifyToken}`;
    sendEmail(norm, 'Verify your ClassMind AI email', verifyEmailHtml(name.trim(), link));

    res.json({ token, user, emailSent: !!resend });
  } catch (err) { apiErr(res, err); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!u) return res.status(401).json({ error: 'Invalid email or password.' });
    const valid = await bcrypt.compare(password, u.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    const user = { id: u.id, name: u.name, email: u.email, university: u.university, level: u.level, department: u.department, courses: JSON.parse(u.courses || '[]'), onboarded: u.onboarded, email_verified: u.email_verified };
    const token = jwt.sign({ id: u.id }, _JWT, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) { apiErr(res, err); }
});

app.get('/api/auth/me', auth, (req, res) => {
  const u = db.prepare('SELECT id,name,email,university,level,department,courses,onboarded,email_verified FROM users WHERE id=?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  res.json({ ...u, courses: JSON.parse(u.courses || '[]') });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, university, level, department, courses, onboarded, password, current_password } = req.body;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    let hash = u.password_hash;
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      if (!current_password) return res.status(400).json({ error: 'Current password is required to change password.' });
      const valid = await bcrypt.compare(current_password, u.password_hash);
      if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });
      hash = await bcrypt.hash(password, 12);
    }
    db.prepare('UPDATE users SET name=?,university=?,level=?,department=?,courses=?,onboarded=?,password_hash=? WHERE id=?')
      .run(name||u.name, university??u.university, level??u.level, department??u.department, JSON.stringify(courses||JSON.parse(u.courses||'[]')), onboarded!==undefined?onboarded:u.onboarded, hash, req.user.id);
    const updated = db.prepare('SELECT id,name,email,university,level,department,courses,onboarded,email_verified FROM users WHERE id=?').get(req.user.id);
    const user = { ...updated, courses: JSON.parse(updated.courses||'[]') };
    const token = jwt.sign({ id: user.id }, _JWT, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) { apiErr(res, err); }
});

// ── Email verification ──
app.get('/api/auth/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/login.html?verify_error=1');
  const row = db.prepare('SELECT * FROM email_verifications WHERE token=?').get(token);
  if (!row) return res.redirect('/login.html?verify_error=1');
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM email_verifications WHERE id=?').run(row.id);
    return res.redirect('/login.html?verify_error=expired');
  }
  db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id);
  db.prepare('DELETE FROM email_verifications WHERE id=?').run(row.id);
  res.redirect('/login.html?verified=1');
});

app.post('/api/auth/resend-verification', auth, async (req, res) => {
  try {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    if (!u) return res.status(404).json({ error: 'User not found.' });
    if (u.email_verified) return res.json({ ok: true, already: true });
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 3600000).toISOString();
    db.prepare('INSERT OR REPLACE INTO email_verifications (user_id, token, expires_at) VALUES (?,?,?)').run(u.id, token, expires);
    const link = `${APP_URL}/verify-email.html?token=${token}`;
    await sendEmail(u.email, 'Verify your ClassMind AI email', verifyEmailHtml(u.name, link));
    res.json({ ok: true });
  } catch (err) { apiErr(res, err); }
});

// ── Forgot / reset password ──
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required.' });
    res.json({ ok: true }); // Always respond OK — don't reveal if email exists
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(email.toLowerCase().trim());
    if (!u) return;
    // Expire old tokens for this user
    db.prepare('DELETE FROM password_resets WHERE user_id=?').run(u.id);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000).toISOString(); // 1 hour
    db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)').run(u.id, token, expires);
    const link = `${APP_URL}/reset-password.html?token=${token}`;
    sendEmail(u.email, 'Reset your ClassMind AI password', resetPasswordHtml(u.name, link));
  } catch (err) { console.error('Forgot-password:', err.message); }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const row = db.prepare('SELECT * FROM password_resets WHERE token=? AND used=0').get(token);
    if (!row) return res.status(400).json({ error: 'Invalid or expired reset link.' });
    if (new Date(row.expires_at) < new Date()) {
      db.prepare('DELETE FROM password_resets WHERE id=?').run(row.id);
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }
    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, row.user_id);
    db.prepare('UPDATE password_resets SET used=1 WHERE id=?').run(row.id);
    res.json({ ok: true });
  } catch (err) { apiErr(res, err); }
});

// ── Delete account ──
app.delete('/api/auth/account', auth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required to delete account.' });
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    const valid = await bcrypt.compare(password, u.password_hash);
    if (!valid) return res.status(400).json({ error: 'Incorrect password.' });
    db.prepare('DELETE FROM users WHERE id=?').run(req.user.id);
    res.json({ ok: true });
  } catch (err) { apiErr(res, err); }
});

// ────────────────────────────────────────────
// ANALYSES (NOTES LIBRARY)
// ────────────────────────────────────────────

app.get('/api/analyses', auth, (req, res) => {
  const rows = db.prepare(`SELECT id, name, created_at,
    json_extract(result_json,'$.overview') AS overview,
    json_extract(result_json,'$.assignments') AS assignments_json
    FROM analyses WHERE user_id=? ORDER BY created_at DESC`).all(req.user.id);
  res.json(rows.map(r => ({
    ...r,
    assignment_count: (() => { try { return JSON.parse(r.assignments_json||'[]').length; } catch { return 0; } })()
  })));
});

app.post('/api/analyses', auth, (req, res) => {
  try {
    const { name, result } = req.body;
    if (!name || !result) return res.status(400).json({ error: 'Name and result required.' });
    const r = db.prepare('INSERT INTO analyses (user_id, name, result_json) VALUES (?,?,?)').run(req.user.id, name, JSON.stringify(result));
    if (result.assignments?.length) {
      const ins = db.prepare('INSERT INTO tasks (user_id,analysis_id,subject,title,deadline,priority,details) VALUES (?,?,?,?,?,?,?)');
      result.assignments.forEach(a => ins.run(req.user.id, r.lastInsertRowid, a.subject||'', a.title||'', a.deadline||'No deadline', a.priority||'MEDIUM', a.details||''));
    }
    res.json({ id: r.lastInsertRowid });
  } catch (err) { apiErr(res, err); }
});

app.get('/api/analyses/:id', auth, (req, res) => {
  const row = db.prepare('SELECT * FROM analyses WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  res.json({ ...row, result: JSON.parse(row.result_json) });
});

app.put('/api/analyses/:id', auth, (req, res) => {
  try {
    const row = db.prepare('SELECT id FROM analyses WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Not found.' });
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required.' });
    db.prepare('UPDATE analyses SET name=? WHERE id=? AND user_id=?').run(name.trim(), req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) { apiErr(res, err); }
});

app.delete('/api/analyses/:id', auth, (req, res) => {
  db.prepare('DELETE FROM analyses WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ────────────────────────────────────────────
// REMINDERS
// ────────────────────────────────────────────

app.get('/api/reminders', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM reminders WHERE user_id=? ORDER BY remind_at ASC').all(req.user.id));
});

app.post('/api/reminders', auth, (req, res) => {
  try {
    const { title, body = '', remind_at, source_type = 'custom', source_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
    if (!remind_at) return res.status(400).json({ error: 'remind_at required.' });
    const r = db.prepare('INSERT INTO reminders (user_id, title, body, remind_at, source_type, source_id) VALUES (?,?,?,?,?,?)').run(req.user.id, title.trim(), body, remind_at, source_type, source_id || null);
    res.json(db.prepare('SELECT * FROM reminders WHERE id=?').get(r.lastInsertRowid));
  } catch (err) { apiErr(res, err); }
});

app.post('/api/reminders/:id/trigger', auth, (req, res) => {
  db.prepare('UPDATE reminders SET triggered=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.patch('/api/reminders/:id', auth, (req, res) => {
  const enabled = req.body.enabled ? 1 : 0;
  db.prepare('UPDATE reminders SET enabled=?, triggered=0 WHERE id=? AND user_id=?').run(enabled, req.params.id, req.user.id);
  res.json(db.prepare('SELECT * FROM reminders WHERE id=?').get(req.params.id));
});

app.delete('/api/reminders/:id', auth, (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ────────────────────────────────────────────
// TASKS
// ────────────────────────────────────────────

app.get('/api/tasks', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC').all(req.user.id));
});

app.post('/api/tasks', auth, (req, res) => {
  try {
    const { subject, title, deadline, priority, details } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required.' });
    const r = db.prepare('INSERT INTO tasks (user_id,subject,title,deadline,priority,details) VALUES (?,?,?,?,?,?)').run(req.user.id, subject||'', title, deadline||'No deadline', priority||'MEDIUM', details||'');
    res.json(db.prepare('SELECT * FROM tasks WHERE id=?').get(r.lastInsertRowid));
  } catch (err) { apiErr(res, err); }
});

app.put('/api/tasks/:id', auth, (req, res) => {
  try {
    const t = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Not found.' });
    const { subject, title, deadline, priority, details, status } = req.body;
    db.prepare('UPDATE tasks SET subject=?,title=?,deadline=?,priority=?,details=?,status=? WHERE id=? AND user_id=?')
      .run(subject??t.subject, title??t.title, deadline??t.deadline, priority??t.priority, details??t.details, status??t.status, req.params.id, req.user.id);
    res.json(db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id));
  } catch (err) { apiErr(res, err); }
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ────────────────────────────────────────────
// FEEDBACK
// ────────────────────────────────────────────

app.post('/api/feedback', optionalAuth, (req, res) => {
  try {
    const { category, message, rating } = req.body;
    if (!category || !message || !message.trim()) return res.status(400).json({ error: 'Category and message are required.' });
    if (message.length > 2000) return res.status(400).json({ error: 'Message is too long (max 2000 characters).' });
    const userId = req.user?.id ?? null;
    db.prepare('INSERT INTO feedback (user_id, category, message, rating) VALUES (?,?,?,?)')
      .run(userId, category, message.trim(), rating ?? null);
    res.json({ ok: true });
  } catch (err) { apiErr(res, err); }
});

app.get('/api/feedback', auth, (req, res) => {
  // Admin-only: only allow if user is the first registered user (id=1)
  if (req.user.id !== 1) return res.status(403).json({ error: 'Forbidden.' });
  const rows = db.prepare(`
    SELECT f.*, u.name as user_name, u.email as user_email
    FROM feedback f LEFT JOIN users u ON f.user_id = u.id
    ORDER BY f.created_at DESC LIMIT 200
  `).all();
  res.json(rows);
});

// ────────────────────────────────────────────
// CGPA CALCULATOR
// ────────────────────────────────────────────

app.post('/api/cgpa/calculate', (req, res) => {
  const { courses } = req.body;
  if (!Array.isArray(courses) || !courses.length) return res.status(400).json({ error: 'Courses array required.' });
  if (courses.length > 30) return res.status(400).json({ error: 'Too many courses.' });
  const GP = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
  let totalQP = 0, totalUnits = 0;
  const processed = courses.map(c => {
    const gp = GP[(c.grade||'').toUpperCase()] ?? null;
    const units = Math.max(0, Math.min(10, parseInt(c.units) || 0));
    if (gp !== null) { totalQP += gp * units; totalUnits += units; }
    return { ...c, grade_point: gp };
  });
  const gpa = totalUnits > 0 ? totalQP / totalUnits : 0;
  const classification = gpa >= 4.5 ? 'First Class Honours' : gpa >= 3.5 ? 'Second Class Upper (2:1)' : gpa >= 2.4 ? 'Second Class Lower (2:2)' : gpa >= 1.5 ? 'Third Class' : gpa > 0 ? 'Pass' : 'No data';
  res.json({ gpa: +gpa.toFixed(2), total_quality_points: totalQP, total_units: totalUnits, classification, courses: processed });
});

// ────────────────────────────────────────────
// AI ANALYSIS
// ────────────────────────────────────────────

const ANALYSIS_SYSTEM = `You are ClassMind AI, a smart academic assistant for Nigerian university students.

Analyze the provided course material — which may include WhatsApp chat exports, lecture notes, timetables, course outlines, semester schedules, past questions, images of notes, or any academic document — and extract ALL structured information available.

Return ONLY valid JSON with these fields (omit any field where no data is found, do not include empty arrays):
{
  "overview": "2-4 sentence summary of what was found in the material",
  "assignments": [{"subject":"","course_code":"","title":"","deadline":"YYYY-MM-DD or descriptive","priority":"HIGH|MEDIUM|LOW","details":""}],
  "timetable": [{"day":"Monday|Tuesday|...|Saturday","time":"HH:MM","subject":"","course_code":"","type":"class|lecture|lab|test|exam|assignment_due","venue":"","lecturer":""}],
  "lecturers": [{"name":"","title":"Dr|Prof|Mr|Mrs|Engr etc","course":"","course_code":"","office":"","email":"","phone":""}],
  "course_outline": [{"course":"","course_code":"","credit_units":0,"semester":"","level":"","lecturer":"","topics":["topic 1","topic 2"],"recommended_texts":[""],"assessment":"e.g. 30% CA, 70% exam"}],
  "topics": {"SubjectName or CourseCode": {"summary":"","key_points":[""],"subtopics":[""]}},
  "tip": "One practical study tip or tech concept in 50 words relevant to Nigerian university students"
}

Rules:
- Priority: HIGH = exam/test/project due within 48h or marked urgent; MEDIUM = due this week; LOW = future deadline
- Extract ALL course codes (e.g. CSC201, EEE302, MTH101) wherever mentioned
- Extract ALL lecturer names, titles, offices, contacts if present
- If a course outline or syllabus is found, populate course_outline with every topic listed
- For timetable, infer day/time from context if not explicit (e.g. "Monday morning" → day:Monday, time:08:00)
- Generate topics entries for every subject found — include key points from notes, outlines, or discussed material
- No markdown, no explanation, just the raw JSON object.`;

app.post('/api/analyze', auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'No content provided.' });
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-opus-4-7', max_tokens: 8192, thinking: { type: 'adaptive' },
      system: ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: `Analyze:\n\n${content.slice(0, 50000)}` }]
    });
    const textBlock = response.content.find(b => b.type === 'text');
    res.json(extractJSON(textBlock?.text || ''));
  } catch (err) { apiErr(res, err); }
});

const IMAGE_TYPES = ['image/jpeg','image/jpg','image/png','image/gif','image/webp'];
const CLAUDE_IMG = { 'image/jpg':'image/jpeg','image/jpeg':'image/jpeg','image/png':'image/png','image/gif':'image/gif','image/webp':'image/webp' };

async function extractFileContent(file) {
  const mime = file.mimetype || '';
  const name = file.originalname || '';
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_TYPES.includes(mime) || ['.jpg','.jpeg','.png','.gif','.webp'].includes(ext)) {
    return { type: 'image', mediaType: CLAUDE_IMG[mime]||'image/jpeg', data: file.buffer.toString('base64'), label: name };
  }
  if (mime === 'application/pdf' || ext === '.pdf') {
    const parsed = await pdfParse(file.buffer);
    return { type: 'text', text: `[FILE: ${name}]\n${parsed.text}`, label: name };
  }
  if (mime.includes('wordprocessingml') || mime === 'application/msword' || ['.docx','.doc'].includes(ext)) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return { type: 'text', text: `[FILE: ${name}]\n${result.value}`, label: name };
  }
  if (mime.includes('spreadsheetml') || mime.includes('excel') || ['.xlsx','.xls'].includes(ext)) {
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    const lines = wb.SheetNames.map(s => `--- ${s} ---\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`);
    return { type: 'text', text: `[FILE: ${name}]\n${lines.join('\n')}`, label: name };
  }
  if (mime.startsWith('text/') || ['.txt','.csv','.md'].includes(ext)) {
    return { type: 'text', text: `[FILE: ${name}]\n${file.buffer.toString('utf8')}`, label: name };
  }
  if (mime.startsWith('audio/') || mime.startsWith('video/') || ['.mp3','.mp4','.wav','.m4a','.mov'].includes(ext)) {
    return { type: 'text', text: `[FILE: ${name}]\n[Audio/video: please paste a transcript for analysis.]`, label: name };
  }
  try { return { type: 'text', text: `[FILE: ${name}]\n${file.buffer.toString('utf8')}`, label: name }; } catch {
    return { type: 'text', text: `[FILE: ${name}]\n[Could not extract content.]`, label: name };
  }
}

app.post('/api/analyze-files', upload.array('files', 20), auth, async (req, res) => {
  try {
    if (!req.files?.length && !req.body.text?.trim()) return res.status(400).json({ error: 'No files or text provided.' });
    const client = getClient();
    const extracted = await Promise.all((req.files||[]).map(f => extractFileContent(f)));
    const contentBlocks = [];
    if (req.body.text?.trim()) contentBlocks.push({ type: 'text', text: `[PASTED TEXT]\n${req.body.text.slice(0,20000)}` });
    for (const item of extracted) {
      if (item.type === 'image') {
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: item.mediaType, data: item.data } });
        contentBlocks.push({ type: 'text', text: `[Above image: ${item.label}]` });
      } else {
        contentBlocks.push({ type: 'text', text: item.text.slice(0, 30000) });
      }
    }
    contentBlocks.push({ type: 'text', text: 'Analyze all the above material.' });
    const response = await client.messages.create({
      model: 'claude-opus-4-7', max_tokens: 8192, thinking: { type: 'adaptive' },
      system: ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: contentBlocks }]
    });
    const textBlock = response.content.find(b => b.type === 'text');
    res.json(extractJSON(textBlock?.text || ''));
  } catch (err) { apiErr(res, err); }
});

// ────────────────────────────────────────────
// AI CHAT (streaming)
// ────────────────────────────────────────────

const STYLE_INSTRUCTIONS = {
  simple: `STYLE — Simple: Use everyday language, real-life analogies. No jargon. Short sentences.`,
  academic: `STYLE — Academic: Formal university-level language. Proper essay format. Cite concepts accurately.`,
  exam: `STYLE — Exam Mode: Bullet points, model answers, definitions, common mistakes. Think marking scheme.`,
  naija: `STYLE — Naija Mode: Talk like a brilliant Nigerian classmate explaining casually. Real, relatable, direct. Still 100% accurate.`,
  eli5: `STYLE — ELI5: Simplest words possible. Analogies to everyday things. Make the student go "ohhhh I get it now!"`,
  tutor: `STYLE — Tutor: Patient, step-by-step, checks understanding. Encouraging throughout.`
};

app.post('/api/chat', auth, async (req, res) => {
  try {
    const { message, history = [], context, style = 'simple' } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'No message provided.' });
    const client = getClient();
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const contextText = context ? JSON.stringify(context, null, 2) : 'No study material analyzed yet.';
    const styleInstruction = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.simple;
    const stream = client.messages.stream({
      model: 'claude-opus-4-7', max_tokens: 4096,
      system: [{ type: 'text', text: `You are ClassMind AI — intelligent study assistant for Nigerian university students.\n\n${styleInstruction}\n\nAcademic context:\n\n${contextText}`, cache_control: { type: 'ephemeral' } }],
      messages: [...history.slice(-10).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: message }]
    });
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat:', err.message);
    if (!res.headersSent) res.status(500).json({ error: IS_PROD ? 'Chat error.' : err.message });
    else { res.write(`data: ${JSON.stringify({ error: 'Stream error.' })}\n\n`); res.end(); }
  }
});

// ── Catch-all → index.html (SPA fallback) ──
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Global error handler ──
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: IS_PROD ? 'Server error.' : err.message });
});

// ── Graceful shutdown ──
process.on('SIGTERM', () => { db.close(); process.exit(0); });
process.on('SIGINT', () => { db.close(); process.exit(0); });

app.listen(PORT, () => console.log(`ClassMind AI running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`));

// ── Helpers ──
function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { assignments: [], timetable: [], topics: {}, overview: 'Could not extract information.', tip: '' };
}

function verifyEmailHtml(name, link) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:500px;margin:40px auto;color:#141414">
    <div style="background:#1B3F6E;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">ClassMind AI</h1>
    </div>
    <div style="background:#fff;border:1px solid #E2E2DC;padding:32px;border-radius:0 0 12px 12px">
      <h2 style="color:#1B3F6E">Hi ${name}, verify your email</h2>
      <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
      <a href="${link}" style="display:inline-block;background:#1B3F6E;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Verify Email</a>
      <p style="color:#747474;font-size:13px">Or copy this link: ${link}</p>
    </div>
  </body></html>`;
}

function resetPasswordHtml(name, link) {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:500px;margin:40px auto;color:#141414">
    <div style="background:#1B3F6E;padding:24px;border-radius:12px 12px 0 0;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">ClassMind AI</h1>
    </div>
    <div style="background:#fff;border:1px solid #E2E2DC;padding:32px;border-radius:0 0 12px 12px">
      <h2 style="color:#1B3F6E">Hi ${name}, reset your password</h2>
      <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
      <a href="${link}" style="display:inline-block;background:#B91C1C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Reset Password</a>
      <p style="color:#747474;font-size:13px">If you didn't request this, ignore this email — your password is unchanged.</p>
      <p style="color:#747474;font-size:13px">Or copy this link: ${link}</p>
    </div>
  </body></html>`;
}
