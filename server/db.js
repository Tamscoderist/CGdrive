import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'database.sqlite');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

function usersTableExists() {
  return !!db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'")
    .get();
}

function getUsersColumns() {
  if (!usersTableExists()) return [];
  return db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
}

function ensureFreshSchema() {
  // Users table (NO role column; roles live in user_roles)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT,
      password TEXT NOT NULL,
      otp TEXT,
      otp_expires INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'user')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users(email)
    WHERE email IS NOT NULL
  `);
}

function migrateUsersRoleToUserRoles() {
  const cols = getUsersColumns();
  if (!cols.includes('role')) return; // nothing to migrate

  try {
    // We need to rebuild the users table while another table (files) references it.
    // Temporarily disable FK checks during the table rebuild.
    // NOTE: SQLite does not allow changing foreign_keys inside a transaction.
    db.pragma('foreign_keys = OFF');
    db.exec('BEGIN');

    const hasEmail = cols.includes('email');
    const selectEmail = hasEmail ? 'email' : 'NULL as email';

    // Capture existing roles before dropping the old table
    db.exec('DROP TABLE IF EXISTS roles_tmp');
    db.exec(`
      CREATE TABLE roles_tmp (
        user_id INTEGER PRIMARY KEY,
        role TEXT NOT NULL
      )
    `);
    db.exec(`INSERT INTO roles_tmp (user_id, role) SELECT id, role FROM users`);

    // Create new users table without role
    db.exec('DROP TABLE IF EXISTS users_new');
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password TEXT NOT NULL,
        otp TEXT,
        otp_expires INTEGER
      )
    `);

    db.exec(`
      INSERT INTO users_new (id, username, email, password, otp, otp_expires)
      SELECT id, username, ${selectEmail}, password, otp, otp_expires
      FROM users
    `);

    // Swap tables
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');

    // Rebuild user_roles to reference the final users table name
    db.exec('DROP TABLE IF EXISTS user_roles');
    db.exec(`
      CREATE TABLE user_roles (
        user_id INTEGER PRIMARY KEY,
        role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'user')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    db.exec(`
      INSERT OR REPLACE INTO user_roles (user_id, role)
      SELECT user_id, role FROM roles_tmp
    `);

    db.exec('DROP TABLE roles_tmp');

    // Recreate indexes
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
      ON users(email)
      WHERE email IS NOT NULL
    `);

    db.exec('COMMIT');
    db.pragma('foreign_keys = ON');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch {}
    try { db.pragma('foreign_keys = ON'); } catch {}
    throw e;
  }
}

// Create/migrate schema
if (!usersTableExists()) {
  ensureFreshSchema();
} else {
  migrateUsersRoleToUserRoles();
  ensureFreshSchema(); // ensure user_roles exists on older DBs too
}

// Files table: id, filename, owner_id (DAC)
db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT,
    stored_path TEXT,
    mime_type TEXT,
    size INTEGER,
    created_at INTEGER,
    owner_id INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  )
`);

// Lightweight migration for existing databases (add upload columns if missing)
for (const stmt of [
  `ALTER TABLE files ADD COLUMN original_name TEXT`,
  `ALTER TABLE files ADD COLUMN stored_path TEXT`,
  `ALTER TABLE files ADD COLUMN mime_type TEXT`,
  `ALTER TABLE files ADD COLUMN size INTEGER`,
  `ALTER TABLE files ADD COLUMN created_at INTEGER`,
]) {
  try { db.exec(stmt); } catch { /* ignore */ }
}

// Seed default accounts if admin does not yet exist
const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin123'").get();
if (!adminExists) {
  const adminHash = bcrypt.hashSync('admin123', 10);
  const adminRes = db
    .prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)')
    .run('admin123', 'admin123@example.com', adminHash);
  db.prepare('INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)')
    .run(adminRes.lastInsertRowid, 'admin');

  const staffHash = bcrypt.hashSync('staff123', 10);
  const staffRes = db
    .prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)')
    .run('staff123', 'staff123@example.com', staffHash);
  db.prepare('INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)')
    .run(staffRes.lastInsertRowid, 'staff');

  console.log('Seeded admin: admin123/admin123 and staff: staff123/staff123');
}

export default db;
