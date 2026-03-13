/**
 * SQLite adapter for local development.
 * Uses server/database.sqlite when DATABASE_URL is not set.
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'database.sqlite');

export function createSqliteDb() {
  const sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');

  function usersTableExists() {
    return !!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='users'").get();
  }

  function getUsersColumns() {
    if (!usersTableExists()) return [];
    return sqlite.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  }

  function ensureFreshSchema() {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password TEXT NOT NULL,
        otp TEXT,
        otp_expires INTEGER
      )
    `);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER PRIMARY KEY,
        role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'user')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL
    `);
  }

  function migrateUsersRoleToUserRoles() {
    const cols = getUsersColumns();
    if (!cols.includes('role')) return;

    try {
      sqlite.pragma('foreign_keys = OFF');
      sqlite.exec('BEGIN');
      const hasEmail = cols.includes('email');
      const selectEmail = hasEmail ? 'email' : 'NULL as email';

      sqlite.exec('DROP TABLE IF EXISTS roles_tmp');
      sqlite.exec(`CREATE TABLE roles_tmp (user_id INTEGER PRIMARY KEY, role TEXT NOT NULL)`);
      sqlite.exec(`INSERT INTO roles_tmp (user_id, role) SELECT id, role FROM users`);

      sqlite.exec('DROP TABLE IF EXISTS users_new');
      sqlite.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT,
          password TEXT NOT NULL,
          otp TEXT,
          otp_expires INTEGER
        )
      `);
      sqlite.exec(`
        INSERT INTO users_new (id, username, email, password, otp, otp_expires)
        SELECT id, username, ${selectEmail}, password, otp, otp_expires FROM users
      `);

      sqlite.exec('DROP TABLE users');
      sqlite.exec('ALTER TABLE users_new RENAME TO users');
      sqlite.exec('DROP TABLE IF EXISTS user_roles');
      sqlite.exec(`
        CREATE TABLE user_roles (
          user_id INTEGER PRIMARY KEY,
          role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'user')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      sqlite.exec(`INSERT OR REPLACE INTO user_roles (user_id, role) SELECT user_id, role FROM roles_tmp`);
      sqlite.exec('DROP TABLE roles_tmp');
      sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);
      sqlite.exec('COMMIT');
      sqlite.pragma('foreign_keys = ON');
    } catch (e) {
      try { sqlite.exec('ROLLBACK'); } catch {}
      try { sqlite.pragma('foreign_keys = ON'); } catch {}
      throw e;
    }
  }

  if (!usersTableExists()) {
    ensureFreshSchema();
  } else {
    migrateUsersRoleToUserRoles();
    ensureFreshSchema();
  }

  sqlite.exec(`
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

  for (const stmt of [
    'ALTER TABLE files ADD COLUMN original_name TEXT',
    'ALTER TABLE files ADD COLUMN stored_path TEXT',
    'ALTER TABLE files ADD COLUMN mime_type TEXT',
    'ALTER TABLE files ADD COLUMN size INTEGER',
    'ALTER TABLE files ADD COLUMN created_at INTEGER',
  ]) {
    try { sqlite.exec(stmt); } catch { /* ignore */ }
  }

  const adminExists = sqlite.prepare("SELECT id FROM users WHERE username = 'admin123'").get();
  if (!adminExists) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const adminRes = sqlite.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run('admin123', 'admin123@example.com', adminHash);
    sqlite.prepare('INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)').run(adminRes.lastInsertRowid, 'admin');
    const staffHash = bcrypt.hashSync('staff123', 10);
    const staffRes = sqlite.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)').run('staff123', 'staff123@example.com', staffHash);
    sqlite.prepare('INSERT OR REPLACE INTO user_roles (user_id, role) VALUES (?, ?)').run(staffRes.lastInsertRowid, 'staff');
    console.log('Seeded admin: admin123/admin123 and staff: staff123/staff123');
  }

  const db = {
    prepare(sql) {
      return {
        run: (...params) => db.run(sql, params),
        get: (...params) => db.get(sql, params),
        all: (...params) => db.all(sql, params),
      };
    },

    async run(sql, params = []) {
      const result = sqlite.prepare(sql).run(...params);
      return { lastInsertRowid: result.lastInsertRowid };
    },

    async get(sql, params = []) {
      return sqlite.prepare(sql).get(...params) ?? null;
    },

    async all(sql, params = []) {
      return sqlite.prepare(sql).all(...params);
    },

    async exec(sql) {
      sqlite.exec(sql);
    },

    close() {
      sqlite.close();
    },
  };

  return db;
}
