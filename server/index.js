import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'ias102-secret-key-change-in-production';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOADS_ROOT, { recursive: true });

function safeBaseName(name) {
  return String(name || 'file')
    .replace(/[^\w.\-() ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'file';
}

function ensureUserDir(userId) {
  const dir = path.join(UPLOADS_ROOT, String(userId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveUploadPath(storedPath) {
  const abs = path.join(UPLOADS_ROOT, String(storedPath || ''));
  const resolved = path.resolve(abs);
  const rootResolved = path.resolve(UPLOADS_ROOT) + path.sep;
  if (!resolved.startsWith(rootResolved)) return null;
  return resolved;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const dir = ensureUserDir(req.user.id);
        cb(null, dir);
      } catch (e) {
        cb(e);
      }
    },
    filename: (req, file, cb) => {
      const original = safeBaseName(file.originalname);
      const ext = path.extname(original);
      const base = safeBaseName(path.basename(original, ext));
      const unique = `${Date.now()}-${crypto.randomInt(1000, 9999)}`;
      cb(null, `${base}-${unique}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.mimetype.startsWith('image/');
    cb(ok ? null : new Error('Only images and PDF files are allowed'), ok);
  },
});

// Simulated OTP: generate 6-digit code, store in DB, expire in 5 min
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

function setOTP(userId) {
  const otp = generateOTP();
  const expires = Date.now() + 5 * 60 * 1000;
  db.prepare('UPDATE users SET otp = ?, otp_expires = ? WHERE id = ?').run(otp, expires, userId);
  return otp;
}

function verifyOTP(userId, code) {
  const row = db.prepare('SELECT otp, otp_expires FROM users WHERE id = ?').get(userId);
  if (!row || row.otp !== code || row.otp_expires < Date.now()) return false;
  db.prepare('UPDATE users SET otp = NULL, otp_expires = NULL WHERE id = ?').run(userId);
  return true;
}

// Auth middleware (requires valid JWT after OTP)
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ----- Auth routes -----

// Register (no role - admin assigns later; default role: user)
app.post('/api/register', (req, res) => {
  const body = req.body || {};
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email is invalid' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol',
    });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const ins = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run(
      username,
      email,
      hash
    );
    db.prepare('INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)').run(ins.lastInsertRowid, 'user');
    res.status(201).json({ message: 'Registered successfully' });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const existingUser = db.prepare('SELECT 1 FROM users WHERE username = ?').get(username);
      if (existingUser) return res.status(400).json({ error: 'Username already exists' });
      const existingEmail = db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
      if (existingEmail) return res.status(400).json({ error: 'Email already exists' });
      return res.status(400).json({ error: 'User already exists' });
    }
    throw e;
  }
});

// Forgot password: generate reset OTP using same OTP fields
app.post('/api/forgot-password', (req, res) => {
  const { username } = req.body || {};
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }
  const user = db.prepare(`
    SELECT u.id, u.username
    FROM users u
    WHERE u.username = ?
  `).get(username.trim());
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const otp = setOTP(user.id);
  res.json({
    message: 'Reset code generated. Use it to set a new password.',
    userId: user.id,
    resetOtp: otp,
  });
});

// Reset password using userId + OTP
app.post('/api/reset-password', (req, res) => {
  const { userId, otp, newPassword } = req.body || {};
  if (!userId || !otp || !newPassword) {
    return res.status(400).json({ error: 'User, reset code, and new password are required' });
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(newPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol',
    });
  }
  const ok = verifyOTP(userId, String(otp).trim());
  if (!ok) {
    return res.status(401).json({ error: 'Invalid or expired reset code' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, userId);
  res.json({ message: 'Password has been updated. You can sign in with the new password.' });
});

// Login (password-based) -> returns userId and triggers OTP
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = db.prepare(`
    SELECT u.id, u.username, u.password, r.role
    FROM users u
    JOIN user_roles r ON r.user_id = u.id
    WHERE u.username = ?
  `).get(username.trim());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const otp = setOTP(user.id);
  res.json({
    message: 'Password valid. Enter OTP to continue.',
    userId: user.id,
    username: user.username,
    role: user.role,
    otpSimulated: otp,
  });
});

// OTP verification -> returns JWT
app.post('/api/verify-otp', (req, res) => {
  const { userId, otp } = req.body;
  if (!userId || !otp) {
    return res.status(400).json({ error: 'UserId and OTP are required' });
  }
  if (!verifyOTP(userId, String(otp).trim())) {
    return res.status(401).json({ error: 'Invalid or expired OTP' });
  }
  const user = db.prepare(`
    SELECT u.id, u.username, r.role
    FROM users u
    JOIN user_roles r ON r.user_id = u.id
    WHERE u.id = ?
  `).get(userId);
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// Get current user (protected)
app.get('/api/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

// Admin only middleware
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ----- Admin: User management (assign roles) -----
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, r.role
    FROM users u
    JOIN user_roles r ON r.user_id = u.id
    ORDER BY u.id
  `).all();
  res.json(rows);
});

app.put('/api/users/:id/role', authMiddleware, adminOnly, (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!role || !['staff', 'user'].includes(role.toLowerCase())) {
    return res.status(400).json({ error: 'Role must be staff or user' });
  }
  const target = db.prepare(`
    SELECT u.id, r.role
    FROM users u
    JOIN user_roles r ON r.user_id = u.id
    WHERE u.id = ?
  `).get(id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Cannot change admin role' });
  db.prepare('UPDATE user_roles SET role = ? WHERE user_id = ?').run(role.toLowerCase(), id);
  res.json({ message: 'Role updated' });
});

// ----- Files (DAC) -----

// List files (all for admin/staff for listing; actual content access is DAC)
app.get('/api/files', authMiddleware, (req, res) => {
  const { role, id } = req.user;
  let rows;
  if (role === 'admin' || role === 'staff') {
    rows = db.prepare(`
      SELECT f.id, f.filename, f.original_name, f.mime_type, f.size, f.created_at, f.owner_id, u.username as owner_name
      FROM files f
      JOIN users u ON u.id = f.owner_id
      ORDER BY f.id DESC
    `).all();
  } else {
    rows = db.prepare(`
      SELECT f.id, f.filename, f.original_name, f.mime_type, f.size, f.created_at, f.owner_id, u.username as owner_name
      FROM files f
      JOIN users u ON u.id = f.owner_id
      WHERE f.owner_id = ?
      ORDER BY f.id DESC
    `).all(id);
  }
  res.json(rows);
});

// Upload file (real upload) - owner = current user
app.post('/api/files/upload', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'File is required' });

    const relPath = path.relative(UPLOADS_ROOT, req.file.path).replaceAll('\\', '/');
    const now = Date.now();
    const ins = db.prepare(`
      INSERT INTO files (filename, original_name, stored_path, mime_type, size, created_at, owner_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.file.filename,
      req.file.originalname,
      relPath,
      req.file.mimetype,
      req.file.size,
      now,
      req.user.id
    );
    res.status(201).json({
      message: 'Uploaded',
      file: {
        id: ins.lastInsertRowid,
        filename: req.file.filename,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype,
        size: req.file.size,
        created_at: now,
        owner_id: req.user.id,
      },
    });
  });
});

// Get file metadata (DAC: only owner can access; admin can access)
app.get('/api/files/:id', authMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  if (file.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. You are not the owner of this file.' });
  }
  res.json(file);
});

// Download/view file binary (DAC)
app.get('/api/files/:id/download', authMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  if (file.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. You are not the owner of this file.' });
  }
  if (!file.stored_path) return res.status(404).json({ error: 'No uploaded content for this record' });

  const resolved = resolveUploadPath(file.stored_path);
  if (!resolved) {
    return res.status(400).json({ error: 'Invalid file path' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'File missing on disk' });
  }

  const mime = file.mime_type || 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  const displayName = safeBaseName(file.original_name || file.filename || 'file');
  const disposition = mime === 'application/pdf' || mime.startsWith('image/')
    ? 'inline'
    : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename="${displayName}"`);
  fs.createReadStream(resolved).pipe(res);
});

// Delete file (DAC: owner/admin only). Deletes DB row and disk content if present.
app.delete('/api/files/:id', authMiddleware, (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  if (file.owner_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. You are not the owner of this file.' });
  }

  if (file.stored_path) {
    const resolved = resolveUploadPath(file.stored_path);
    if (resolved) {
      try {
        if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
      } catch {
        // ignore disk delete failures; still delete DB record
      }
    }
  }

  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Seed sample files for demo (if empty)
const fileCount = db.prepare('SELECT COUNT(*) as c FROM files').get();
if (fileCount.c === 0) {
  const admin = db.prepare("SELECT id FROM users WHERE username = 'admin123'").get();
  if (admin) {
    db.prepare('INSERT INTO files (filename, created_at, owner_id) VALUES (?, ?, ?)').run('admin-document.txt', Date.now(), admin.id);
    db.prepare('INSERT INTO files (filename, created_at, owner_id) VALUES (?, ?, ?)').run('secret-report.pdf', Date.now(), admin.id);
  }
  console.log('Seeded sample files');
}

// 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
