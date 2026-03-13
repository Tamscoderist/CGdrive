// Dev: Vite proxy uses same-origin /api
// Prod (Vercel): set VITE_API_URL to your backend base URL (e.g. https://your-backend.com/api)
const API = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('token');
}

function headers(includeAuth = true) {
  const h = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
  }
  return h;
}

export async function register(username, email, password) {
  const res = await fetch(`${API}/register`, {
    method: 'POST',
    headers: headers(false),
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function login(username, password) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: headers(false),
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function verifyOTP(userId, otp) {
  const res = await fetch(`${API}/verify-otp`, {
    method: 'POST',
    headers: headers(false),
    body: JSON.stringify({ userId, otp }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'OTP verification failed');
  return data;
}

export async function getMe() {
  const res = await fetch(`${API}/me`, { headers: headers() });
  if (res.status === 401) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to get user');
  return data;
}

export async function getUsers() {
  const res = await fetch(`${API}/users`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load users');
  return data;
}

export async function updateUserRole(userId, role) {
  const res = await fetch(`${API}/users/${userId}/role`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ role }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to update role');
  return data;
}

export async function getFiles(scope = 'mine') {
  const url = scope === 'mine' ? `${API}/files` : `${API}/files?scope=${encodeURIComponent(scope)}`;
  const res = await fetch(url, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load files');
  return data;
}

export async function getFile(id) {
  const res = await fetch(`${API}/files/${id}`, { headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to load file');
  return data;
}

export async function uploadFile(file) {
  const t = getToken();
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(`${API}/files/upload`, {
    method: 'POST',
    headers: t ? { Authorization: `Bearer ${t}` } : undefined,
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data;
}

export async function fetchFileBlob(id) {
  const res = await fetch(`${API}/files/${id}/download`, { headers: headers() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to download file');
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream';
  const blob = await res.blob();
  return { blob, contentType };
}

export async function deleteFile(id) {
  const res = await fetch(`${API}/files/${id}`, { method: 'DELETE', headers: headers() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to delete file');
  return data;
}

export async function createFile(filename) {
  const res = await fetch(`${API}/files`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ filename }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Failed to create file');
  return data;
}
