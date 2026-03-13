-- Supabase SQL: SQLite-compatible tables for CGdrive
-- This recreates the SAME logical tables you have in SQLite:
-- - users
-- - user_roles
-- - files
--


-- Enable bcrypt hashing for seeding (optional but useful)
create extension if not exists pgcrypto;

-- ---------- users ----------
create table if not exists public.users (
  id bigserial primary key,
  username text unique not null,
  email text,
  password text not null,
  otp text,
  otp_expires bigint
);

-- Equivalent of SQLite partial unique index on email (only when email is provided)
create unique index if not exists idx_users_email
on public.users(email)
where email is not null;

-- ---------- user_roles ----------
create table if not exists public.user_roles (
  user_id bigint primary key references public.users(id) on delete cascade,
  role text not null check (role in ('admin','staff','user'))
);

-- ---------- files ----------
create table if not exists public.files (
  id bigserial primary key,
  filename text not null,
  original_name text,
  stored_path text,
  mime_type text,
  size bigint,
  created_at bigint,
  owner_id bigint not null references public.users(id) on delete restrict
);

create index if not exists files_owner_id_idx on public.files(owner_id);

-- ---------- seed default users (same as local app) ----------
-- Creates:
--   admin123 / admin123  with role admin
--   staff123 / staff123  with role staff
do $$
declare
  v_admin_id bigint;
  v_staff_id bigint;
begin
  -- admin123
  select id into v_admin_id from public.users where username = 'admin123';
  if v_admin_id is null then
    insert into public.users (username, email, password)
    values ('admin123', 'admin123@example.com', crypt('admin123', gen_salt('bf')))
    returning id into v_admin_id;
  end if;

  insert into public.user_roles (user_id, role)
  values (v_admin_id, 'admin')
  on conflict (user_id) do update set role = excluded.role;

  -- staff123
  select id into v_staff_id from public.users where username = 'staff123';
  if v_staff_id is null then
    insert into public.users (username, email, password)
    values ('staff123', 'staff123@example.com', crypt('staff123', gen_salt('bf')))
    returning id into v_staff_id;
  end if;

  insert into public.user_roles (user_id, role)
  values (v_staff_id, 'staff')
  on conflict (user_id) do update set role = excluded.role;
end $$;



