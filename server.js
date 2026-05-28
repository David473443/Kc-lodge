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

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'classmind-secret-key-change-in-prod';

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
    source_type TEXT DEFAULT 'custom',
    source_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ── Auth middleware ──
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Optional auth — attaches user if token present but doesn't block
function optionalAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch {} }
  next();
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

let anthropic;
function getClient() {
  if (!anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured.');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
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

// ────────────────────────────────────────────
// AUTH ROUTES
// ────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) return res.status(400).json({ error: 'An account with this email already exists.' });
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name.trim(), email.toLowerCase().trim(), hash);
    const user = { id: result.lastInsertRowid, name: name.trim(), email: email.toLowerCase().trim(), onboarded: 0, university: '', level: '', department: '', courses: [] };
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    console.error('Register:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!u) return res.status(401).json({ error: 'Invalid email or password.' });
    const valid = await bcrypt.compare(password, u.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });
    const user = { id: u.id, name: u.name, email: u.email, university: u.university, level: u.level, department: u.department, courses: JSON.parse(u.courses || '[]'), onboarded: u.onboarded };
    const token = jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    console.error('Login:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', auth, (req, res) => {
  const u = db.prepare('SELECT id,name,email,university,level,department,courses,onboarded FROM users WHERE id=?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  res.json({ ...u, courses: JSON.parse(u.courses || '[]') });
});

app.put('/api/auth/profile', auth, async (req, res) => {
  try {
    const { name, university, level, department, courses, onboarded, password, current_password } = req.body;
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    let hash = u.password_hash;
    if (password && password.length >= 6) {
      if (current_password) {
        const valid = await bcrypt.compare(current_password, u.password_hash);
        if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });
      }
      hash = await bcrypt.hash(password, 10);
    }
    db.prepare('UPDATE users SET name=?,university=?,level=?,department=?,courses=?,onboarded=?,password_hash=? WHERE id=?')
      .run(name||u.name, university??u.university, level??u.level, department??u.department, JSON.stringify(courses||JSON.parse(u.courses||'[]')), onboarded!==undefined?onboarded:u.onboarded, hash, req.user.id);
    const updated = db.prepare('SELECT id,name,email,university,level,department,courses,onboarded FROM users WHERE id=?').get(req.user.id);
    const user = { ...updated, courses: JSON.parse(updated.courses||'[]') };
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/analyses/:id', auth, (req, res) => {
  db.prepare('DELETE FROM analyses WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ────────────────────────────────────────────
// REMINDERS
// ────────────────────────────────────────────

app.get('/api/reminders', auth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM reminders WHERE user_id=? ORDER BY remind_at ASC'
  ).all(req.user.id);
  res.json(rows);
});

app.post('/api/reminders', auth, (req, res) => {
  try {
    const { title, body = '', remind_at, source_type = 'custom', source_id } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title required.' });
    if (!remind_at) return res.status(400).json({ error: 'remind_at required.' });
    const r = db.prepare(
      'INSERT INTO reminders (user_id, title, body, remind_at, source_type, source_id) VALUES (?,?,?,?,?,?)'
    ).run(req.user.id, title.trim(), body, remind_at, source_type, source_id || null);
    const row = db.prepare('SELECT * FROM reminders WHERE id=?').get(r.lastInsertRowid);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reminders/:id/trigger', auth, (req, res) => {
  db.prepare('UPDATE reminders SET triggered=1 WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
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
    const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(r.lastInsertRowid);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tasks/:id', auth, (req, res) => {
  try {
    const t = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Not found.' });
    const { subject, title, deadline, priority, details, status } = req.body;
    db.prepare('UPDATE tasks SET subject=?,title=?,deadline=?,priority=?,details=?,status=? WHERE id=? AND user_id=?')
      .run(subject??t.subject, title??t.title, deadline??t.deadline, priority??t.priority, details??t.details, status??t.status, req.params.id, req.user.id);
    const updated = db.prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ────────────────────────────────────────────
// CGPA CALCULATOR
// ────────────────────────────────────────────

app.post('/api/cgpa/calculate', (req, res) => {
  const { courses } = req.body;
  if (!courses?.length) return res.status(400).json({ error: 'Courses required.' });
  const GP = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
  let totalQP = 0, totalUnits = 0;
  const processed = courses.map(c => {
    const gp = GP[(c.grade||'').toUpperCase()] ?? null;
    const units = Math.max(0, parseInt(c.units) || 0);
    if (gp !== null) { totalQP += gp * units; totalUnits += units; }
    return { ...c, grade_point: gp };
  });
  const gpa = totalUnits > 0 ? totalQP / totalUnits : 0;
  const classification = gpa >= 4.5 ? 'First Class Honours' : gpa >= 3.5 ? 'Second Class Upper (2:1)' : gpa >= 2.4 ? 'Second Class Lower (2:2)' : gpa >= 1.5 ? 'Third Class' : gpa > 0 ? 'Pass' : 'No data';
  res.json({ gpa: +gpa.toFixed(2), total_quality_points: totalQP, total_units: totalUnits, classification, courses: processed });
});

// ────────────────────────────────────────────
// AI ANALYSIS (text)
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

app.post('/api/analyze', optionalAuth, async (req, res) => {
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
  } catch (err) {
    console.error('Analyze:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────
// AI ANALYSIS (multi-file)
// ────────────────────────────────────────────

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

app.post('/api/analyze-files', upload.array('files', 20), optionalAuth, async (req, res) => {
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
  } catch (err) {
    console.error('Analyze-files:', err.message);
    res.status(500).json({ error: err.message });
  }
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

app.post('/api/chat', optionalAuth, async (req, res) => {
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
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else { res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`); res.end(); }
  }
});

// ── Catch-all → index.html ──
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`ClassMind AI running on port ${PORT}`));

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { assignments: [], timetable: [], topics: {}, overview: 'Could not extract information.', tip: '' };
}
