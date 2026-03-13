/**
 * PostgreSQL adapter for Supabase (production).
 * Uses DATABASE_URL env var (Supabase connection string).
 */
import pg from 'pg';

function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function createPgDb(connectionString) {
  const pool = new pg.Pool({
    connectionString,
    ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : undefined,
  });

  const db = {
    prepare(sql) {
      return {
        run: (...params) => db.run(sql, params),
        get: (...params) => db.get(sql, params),
        all: (...params) => db.all(sql, params),
      };
    },

    async run(sql, params = []) {
      const pgSql = toPgParams(sql);
      const isPlainInsert = /^\s*insert\s+/i.test(sql.trim()) && !/on\s+conflict/i.test(sql) && !/returning\s+/i.test(sql);
      const finalSql = isPlainInsert ? `${pgSql.replace(/;\s*$/, '')} RETURNING id` : pgSql;
      const res = await pool.query(finalSql, params);
      const lastInsertRowid = res.rows[0]?.id ?? (res.rowCount > 0 ? null : undefined);
      return { lastInsertRowid, rowCount: res.rowCount };
    },

    async get(sql, params = []) {
      const res = await pool.query(toPgParams(sql), params);
      return res.rows[0] ?? null;
    },

    async all(sql, params = []) {
      const res = await pool.query(toPgParams(sql), params);
      return res.rows;
    },

    async exec(sql) {
      await pool.query(sql);
    },

    close() {
      return pool.end();
    },
  };

  // Seed admin/staff if missing (Supabase schema already applied via migration)
  const adminExists = await db.get("SELECT id FROM public.users WHERE username = 'admin123'");
  if (!adminExists) {
    const bcrypt = (await import('bcryptjs')).default;
    const adminHash = bcrypt.hashSync('admin123', 10);
    const adminRes = await db.run(
      'INSERT INTO public.users (username, email, password) VALUES ($1, $2, $3)',
      ['admin123', 'admin123@example.com', adminHash]
    );
    await db.run(
      'INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role',
      [adminRes.lastInsertRowid, 'admin']
    );

    const staffHash = bcrypt.hashSync('staff123', 10);
    const staffRes = await db.run(
      'INSERT INTO public.users (username, email, password) VALUES ($1, $2, $3)',
      ['staff123', 'staff123@example.com', staffHash]
    );
    await db.run(
      'INSERT INTO public.user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role',
      [staffRes.lastInsertRowid, 'staff']
    );

    console.log('Seeded admin: admin123/admin123 and staff: staff123/staff123');
  }

  return db;
}
