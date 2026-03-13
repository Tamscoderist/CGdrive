-- CGdrive schema - IAS102
-- Works with SQLite locally and PostgreSQL on Supabase

-- Users table (auth + OTP for MFA)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password TEXT NOT NULL,
  otp TEXT,
  otp_expires INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
ON users(email)
WHERE email IS NOT NULL;

-- Roles: admin, staff, user
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('admin', 'staff', 'user')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Files - owner_id is used for DAC (only owner can access)
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
);

CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);

-- Default users are seeded by the server (admin123, staff123)

-- --- PostgreSQL version (Supabase)
-- create extension if not exists pgcrypto;

--
-- create table if not exists public.users (
--   id bigserial primary key,
--   username text unique not null,
--   email text,
--   password text not null,
--   otp text,
--   otp_expires bigint
-- );

-- create unique index if not exists idx_users_email
-- on public.users(email)
-- where email is not null;

--
-- create table if not exists public.user_roles (
--   user_id bigint primary key references public.users(id) on delete cascade,
--   role text not null check (role in ('admin','staff','user'))
-- );

-- create table if not exists public.files (
--   id bigserial primary key,
--   filename text not null,
--   original_name text,
--   stored_path text,
--   mime_type text,
--   size bigint,
--   created_at bigint,
--   owner_id bigint not null references public.users(id) on delete restrict
-- );

-- create index if not exists files_owner_id_idx on public.files(owner_id);

