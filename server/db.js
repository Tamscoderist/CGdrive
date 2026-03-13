/**
 * Database module - selects SQLite (local) or PostgreSQL (production) based on DATABASE_URL.
 *
 * - No DATABASE_URL or not postgres: use SQLite (server/database.sqlite)
 * - DATABASE_URL starts with postgres: use Supabase/PostgreSQL (e.g. on Render)
 *
 * Set DATABASE_URL in Render to your Supabase connection string:
 * postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
 */
const DATABASE_URL = process.env.DATABASE_URL;
const usePostgres = DATABASE_URL && DATABASE_URL.startsWith('postgres');

let db;

if (usePostgres) {
  const { createPgDb } = await import('./db-postgres.js');
  db = await createPgDb(DATABASE_URL);
  console.log('Using PostgreSQL (Supabase)');
} else {
  const { createSqliteDb } = await import('./db-sqlite.js');
  db = createSqliteDb();
  console.log('Using SQLite (local)');
}

export default db;
