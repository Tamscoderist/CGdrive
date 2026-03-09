-- CGdrive Supabase setup (Postgres + RLS + Storage policies)
-- Run this in Supabase: SQL Editor → New query → paste → Run.
--
-- IMPORTANT
-- - This assumes you will use Supabase Auth (auth.users).
-- - Roles are stored in public.profiles.role (admin/staff/user).
-- - Files are stored in public.files and the binary data in Supabase Storage bucket "uploads".

-- ---------- Helpers ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'staff'
  );
$$;

-- ---------- Profiles (users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  email text unique,
  role text not null default 'user' check (role in ('admin','staff','user')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile; admin can read all
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

-- Users can update their own username/email; admin can update anyone (including role)
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

-- Admin can change roles for others (staff/user). Keeps at least one admin up to you.
-- (UI should restrict, policy allows admin.)

-- Prevent direct inserts from client (handled by trigger)
drop policy if exists "profiles_no_direct_insert" on public.profiles;
create policy "profiles_no_direct_insert"
on public.profiles
for insert
to authenticated
with check (false);

-- Auto-create profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_email text;
begin
  v_email := new.email;
  -- Prefer username from metadata; fallback to email prefix.
  v_username := coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email,''), '@', 1));

  -- Ensure uniqueness by appending a short suffix if needed.
  if exists (select 1 from public.profiles p where p.username = v_username) then
    v_username := v_username || '-' || right(replace(gen_random_uuid()::text, '-', ''), 6);
  end if;

  insert into public.profiles (id, username, email, role)
  values (new.id, v_username, v_email, 'user')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- ---------- Files metadata ----------
create table if not exists public.files (
  id bigserial primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  original_name text not null,
  storage_path text not null, -- e.g. "<user_uuid>/<filename>"
  mime_type text,
  size bigint,
  created_at timestamptz not null default now()
);

create index if not exists files_owner_id_idx on public.files(owner_id);
create index if not exists files_created_at_idx on public.files(created_at desc);

alter table public.files enable row level security;

-- SELECT:
-- - admin: all files
-- - staff: all files metadata (your "unique staff feature")
-- - user: only own files
drop policy if exists "files_select_owner_or_staff_admin" on public.files;
create policy "files_select_owner_or_staff_admin"
on public.files
for select
to authenticated
using (owner_id = auth.uid() or public.is_admin() or public.is_staff());

-- INSERT: authenticated users can insert only for themselves
drop policy if exists "files_insert_own" on public.files;
create policy "files_insert_own"
on public.files
for insert
to authenticated
with check (owner_id = auth.uid());

-- UPDATE: owner or admin
drop policy if exists "files_update_owner_or_admin" on public.files;
create policy "files_update_owner_or_admin"
on public.files
for update
to authenticated
using (owner_id = auth.uid() or public.is_admin())
with check (owner_id = auth.uid() or public.is_admin());

-- DELETE: owner or admin
drop policy if exists "files_delete_owner_or_admin" on public.files;
create policy "files_delete_owner_or_admin"
on public.files
for delete
to authenticated
using (owner_id = auth.uid() or public.is_admin());

-- ---------- Storage bucket + policies ----------
-- Create private bucket "uploads" (safe to run multiple times).
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', false)
on conflict (id) do nothing;

-- Storage policies:
-- - Upload: only to your own folder: "<uid>/..."
-- - Download: owner or admin ONLY (staff cannot download others; DAC preserved)
-- - Delete: owner or admin

-- Allow upload (INSERT) only to own folder
drop policy if exists "storage_upload_own_folder" on storage.objects;
create policy "storage_upload_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'uploads'
  and name like (auth.uid()::text || '/%')
);

-- Allow read (SELECT) for owner/admin only
drop policy if exists "storage_read_owner_or_admin" on storage.objects;
create policy "storage_read_owner_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'uploads'
  and (
    name like (auth.uid()::text || '/%')
    or public.is_admin()
  )
);

-- Allow delete for owner/admin only
drop policy if exists "storage_delete_owner_or_admin" on storage.objects;
create policy "storage_delete_owner_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'uploads'
  and (
    name like (auth.uid()::text || '/%')
    or public.is_admin()
  )
);

-- ---------- Optional: bootstrap first admin ----------
-- After you create your first user via Supabase Auth UI,
-- run this manually (replace <YOUR_USER_UUID>):
-- update public.profiles set role='admin' where id = '<YOUR_USER_UUID>';

