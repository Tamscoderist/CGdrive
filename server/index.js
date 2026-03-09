import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './supabaseClient.js';

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

async function setOTP(userId) {
  const otp = generateOTP();
  const expires = Date.now() + 5 * 60 * 1000;
  const { error } = await supabase
    .from('users')
    .update({ otp, otp_expires: expires })
    .eq('id', userId);
  if (error) throw error;
  return otp;
}

async function verifyOTP(userId, code) {
  const { data, error } = await supabase
    .from('users')
    .select('otp, otp_expires')
    .eq('id', userId)
    .single();
  if (error || !data || data.otp !== code || data.otp_expires < Date.now()) return false;
  await supabase.from('users').update({ otp: null, otp_expires: null }).eq('id', userId);
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

async function getUserWithRoleById(id) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', id)
    .single();
  if (error || !user) return null;
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', id)
    .single();
  return { ...user, role: roleRow?.role || 'user' };
}

async function getUserWithRoleByUsername(username) {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, username, password')
    .eq('username', username)
    .single();
  if (error || !user) return null;
  const { data: roleRow } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single();
  return { ...user, role: roleRow?.role || 'user' };
}

// ----- Auth routes -----

// Register (no role - admin assigns later; default role: user)
app.post('/api/register', async (req, res) => {
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
    const { data: user, error } = await supabase
      .from('users')
      .insert({ username, email, password: hash })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      throw error;
    }
    await supabase
      .from('user_roles')
      .upsert({ user_id: user.id, role: 'user' }, { onConflict: 'user_id' });
    res.status(201).json({ message: 'Registered successfully' });
  } catch (e) {
    console.error('Register error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Forgot password: generate reset OTP using same OTP fields
app.post('/api/forgot-password', async (req, res) => {
  const { username } = req.body || {};
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }
  try {
    const user = await getUserWithRoleByUsername(username.trim());
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const otp = await setOTP(user.id);
    res.json({
      message: 'Reset code generated. Use it to set a new password.',
      userId: user.id,
      resetOtp: otp,
    });
  } catch (e) {
    console.error('Forgot password error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password using username + OTP
app.post('/api/reset-password', async (req, res) => {
  const { userId, otp, newPassword } = req.body || {};
  if (!userId || !otp || !newPassword) {
    return res.status(400).json({ error: 'User, reset code, and new password are required' });
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(newPassword)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol',
    });
  }
  try {
    const ok = await verifyOTP(userId, String(otp).trim());
    if (!ok) {
      return res.status(401).json({ error: 'Invalid or expired reset code' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    const { error } = await supabase
      .from('users')
      .update({ password: hash })
      .eq('id', userId);
    if (error) throw error;
    res.json({ message: 'Password has been updated. You can sign in with the new password.' });
  } catch (e) {
    console.error('Reset password error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login (password-based) -> returns userId and triggers OTP
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const user = await getUserWithRoleByUsername(username.trim());
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const otp = await setOTP(user.id);
    res.json({
      message: 'Password valid. Enter OTP to continue.',
      userId: user.id,
      username: user.username,
      role: user.role,
      otpSimulated: otp, // For dev: show OTP in response (simulated MFA)
    });
  } catch (e) {
    console.error('Login error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// OTP verification -> returns JWT
app.post('/api/verify-otp', async (req, res) => {
  const { userId, otp } = req.body;
  if (!userId || !otp) {
    return res.status(400).json({ error: 'UserId and OTP are required' });
  }
  try {
    const ok = await verifyOTP(userId, String(otp).trim());
    if (!ok) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }
    const user = await getUserWithRoleById(userId);
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    console.error('Verify OTP error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
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
app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, user_roles(role)')
      .order('id', { ascending: true });
    if (error) throw error;
    const rows = (data || []).map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.user_roles?.[0]?.role || 'user',
    }));
    res.json(rows);
  } catch (e) {
    console.error('Get users error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/users/:id/role', authMiddleware, adminOnly, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!role || !['staff', 'user'].includes(role.toLowerCase())) {
    return res.status(400).json({ error: 'Role must be staff or user' });
  }
  try {
    const { data: userRole, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;

    if (!userRole) {
      const { data: user, error: userErr } = await supabase
        .from('users')
        .select('id')
        .eq('id', id)
        .single();
      if (userErr || !user) return res.status(404).json({ error: 'User not found' });
    } else if (userRole.role === 'admin') {
      return res.status(403).json({ error: 'Cannot change admin role' });
    }

    const { error: upsertErr } = await supabase
      .from('user_roles')
      .upsert({ user_id: Number(id), role: role.toLowerCase() }, { onConflict: 'user_id' });
    if (upsertErr) throw upsertErr;
    res.json({ message: 'Role updated' });
  } catch (e) {
    console.error('Update role error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----- Files (DAC) -----

// List files (all for admin/staff for listing; actual content access is DAC)
app.get('/api/files', authMiddleware, async (req, res) => {
  const { role, id } = req.user;
  try {
    const query = supabase
      .from('files')
      .select('id, filename, original_name, mime_type, size, created_at, owner_id, owner:users(username)')
      .order('id', { ascending: false });

    if (!(role === 'admin' || role === 'staff')) {
      query.eq('owner_id', id);
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []).map((f) => ({
      id: f.id,
      filename: f.filename,
      original_name: f.original_name,
      mime_type: f.mime_type,
      size: f.size,
      created_at: f.created_at,
      owner_id: f.owner_id,
      owner_name: f.owner?.username || null,
    }));
    res.json(rows);
  } catch (e) {
    console.error('Get files error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload file (real upload) - owner = current user
app.post('/api/files/upload', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) return res.status(400).json({ error: 'File is required' });

    (async () => {
      try {
        const relPath = path.relative(UPLOADS_ROOT, req.file.path).replaceAll('\\', '/');
        const now = Date.now();
        const { data, error } = await supabase
          .from('files')
          .insert({
            filename: req.file.filename,
            original_name: req.file.originalname,
            stored_path: relPath,
            mime_type: req.file.mimetype,
            size: req.file.size,
            created_at: now,
            owner_id: req.user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        res.status(201).json({
          message: 'Uploaded',
          file: {
            id: data.id,
            filename: req.file.filename,
            original_name: req.file.originalname,
            mime_type: req.file.mimetype,
            size: req.file.size,
            created_at: now,
            owner_id: req.user.id,
          },
        });
      } catch (e2) {
        console.error('Upload file error', e2);
        res.status(500).json({ error: 'Failed to save file metadata' });
      }
    })();
  });
});

// Get file metadata (DAC: only owner can access; admin can access)
app.get('/api/files/:id', authMiddleware, async (req, res) => {
  try {
    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (file.owner_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. You are not the owner of this file.' });
    }
    res.json(file);
  } catch (e) {
    console.error('Get file metadata error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download/view file binary (DAC)
app.get('/api/files/:id/download', authMiddleware, async (req, res) => {
  try {
    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
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
  } catch (e) {
    console.error('Download file error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete file (DAC: owner/admin only). Deletes DB row and disk content if present.
app.delete('/api/files/:id', authMiddleware, async (req, res) => {
  try {
    const { data: file, error } = await supabase
      .from('files')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
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

    const { error: delErr } = await supabase.from('files').delete().eq('id', req.params.id);
    if (delErr) throw delErr;
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error('Delete file error', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
