-- StageFlow Cloud — database schema for Supabase
-- Run once in your Supabase project: Dashboard → SQL Editor → paste this file → Run.
-- Safe to run again (it only creates what is missing).
--
-- Model: only people on the team list (app_members) can use the cloud. The first person to sign in
-- becomes the admin and adds the others by email. Everyone on the team can open and edit every set.
-- Dancers never sign in: each set can have a private, view-only portal link for phones.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.sets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default 'Untitled set',
  meta        jsonb not null default '{}'::jsonb,      -- running order, notes, linked roster
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

-- Co-choreographers, invited by email. They get access when they sign in with that email.
create table if not exists public.set_members (
  set_id      uuid not null references public.sets(id) on delete cascade,
  email       text not null,
  role        text not null default 'editor' check (role in ('editor')),
  added_at    timestamptz not null default now(),
  primary key (set_id, email)
);

create table if not exists public.segments (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.sets(id) on delete cascade,
  name        text not null default 'Segment',
  file_name   text,                                    -- suggested local file name
  data        jsonb not null,                          -- the segment, without its music
  audio_path  text,                                    -- object in the stageflow-audio bucket
  audio_hash  text,
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index if not exists segments_set_idx on public.segments(set_id);

-- Per-person data that follows the account between devices (rosters, dance styles).
create table if not exists public.user_data (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  rosters     jsonb not null default '{"rosters":[]}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- The team: the only people who can use StageFlow Cloud. Managed by the admin from the app.
create table if not exists public.app_members (
  email       text primary key,
  role        text not null default 'member' check (role in ('admin', 'member')),
  added_at    timestamptz not null default now(),
  added_by    text
);

-- Private, view-only links for dancers' phones (one per set; resetting makes a new one).
create table if not exists public.portal_links (
  set_id      uuid primary key references public.sets(id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Who is who
-- ---------------------------------------------------------------------------
create or replace function public.my_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;
create or replace function public.is_app_member() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.app_members where email = public.my_email());
$$;
create or replace function public.is_app_admin() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.app_members where email = public.my_email() and role = 'admin');
$$;

-- Who may see a set: everyone on the team (plus, from older versions, its owner and people invited to it)
create or replace function public.can_access_set(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_app_member()
      or exists (select 1 from public.sets s where s.id = sid and s.owner_id = auth.uid())
      or exists (select 1 from public.set_members m
                 where m.set_id = sid and lower(m.email) = public.my_email());
$$;

-- Team status for the signed-in person: { member, admin, hasAdmin }
create or replace function public.team_status() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('member', public.is_app_member(), 'admin', public.is_app_admin(),
                            'hasAdmin', exists (select 1 from public.app_members where role = 'admin'));
$$;
-- The first person to call this becomes the admin (only while the team has no admin yet).
create or replace function public.claim_admin() returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.my_email() = '' then return false; end if;
  perform pg_advisory_xact_lock(4242);
  if exists (select 1 from public.app_members where role = 'admin') then return public.is_app_admin(); end if;
  insert into public.app_members (email, role, added_by) values (public.my_email(), 'admin', public.my_email())
    on conflict (email) do update set role = 'admin';
  return true;
end $$;
-- Admins add and remove people (and can make another admin).
create or replace function public.team_add(member_email text, make_admin boolean default false) returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(member_email));
begin
  if not public.is_app_admin() then raise exception 'Only the team admin can add people.' using errcode = '42501'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That doesn''t look like an email address.'; end if;
  insert into public.app_members (email, role, added_by) values (e, case when make_admin then 'admin' else 'member' end, public.my_email())
    on conflict (email) do update set role = case when make_admin then 'admin' else public.app_members.role end;
end $$;
create or replace function public.team_remove(member_email text) returns void language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(member_email));
begin
  if not public.is_app_admin() then raise exception 'Only the team admin can remove people.' using errcode = '42501'; end if;
  if e = public.my_email() and (select count(*) from public.app_members where role = 'admin') <= 1 then
    raise exception 'You are the only admin — make someone else admin first.';
  end if;
  delete from public.app_members where email = e;
end $$;

create or replace function public.is_set_owner(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sets s where s.id = sid and s.owner_id = auth.uid());
$$;

-- keep updated_at / updated_by current
create or replace function public.touch_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists sets_touch on public.sets;
create trigger sets_touch before update on public.sets for each row execute function public.touch_row();
drop trigger if exists segments_touch on public.segments;
create trigger segments_touch before update on public.segments for each row execute function public.touch_row();

-- ---------------------------------------------------------------------------
-- Dancer portal: a private link per set that shows its formations, read-only, without signing in
-- ---------------------------------------------------------------------------
create or replace function public.portal_link(sid uuid, reset boolean default false) returns text language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if not public.can_access_set(sid) then raise exception 'No access to this set.' using errcode = '42501'; end if;
  select token into tok from public.portal_links where set_id = sid;
  if tok is null or reset then
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');   -- 64 hex characters
    insert into public.portal_links (set_id, token) values (sid, tok)
      on conflict (set_id) do update set token = excluded.token, created_at = now();
  end if;
  return tok;
end $$;
create or replace function public.portal_stop(sid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_set(sid) then raise exception 'No access to this set.' using errcode = '42501'; end if;
  delete from public.portal_links where set_id = sid;
end $$;
-- What a portal link shows: the set's name and its segments' formations (no music, no move clips).
create or replace function public.portal_get(tok text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', s.name,
    'order', coalesce(s.meta -> 'order', '[]'::jsonb),
    'updatedAt', greatest(s.updated_at, (select max(g.updated_at) from public.segments g where g.set_id = s.id)),
    'segments', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'updatedAt', g.updated_at,
                                   'data', g.data - 'clips' - 'choreo' - 'audio') order by g.name)
                          from public.segments g where g.set_id = s.id), '[]'::jsonb))
  from public.portal_links p join public.sets s on s.id = p.set_id
  where length(tok) >= 32 and p.token = tok;
$$;
revoke execute on function public.portal_link(uuid, boolean), public.portal_stop(uuid), public.claim_admin(), public.team_add(text, boolean), public.team_remove(text) from anon, public;
grant execute on function public.portal_link(uuid, boolean), public.portal_stop(uuid), public.claim_admin(), public.team_add(text, boolean), public.team_remove(text) to authenticated;
grant execute on function public.portal_get(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.sets        enable row level security;
alter table public.set_members enable row level security;
alter table public.segments    enable row level security;
alter table public.user_data   enable row level security;
alter table public.app_members enable row level security;
alter table public.portal_links enable row level security;

drop policy if exists team_select on public.app_members;
create policy team_select on public.app_members for select to authenticated using (public.is_app_member());
drop policy if exists portal_select on public.portal_links;
create policy portal_select on public.portal_links for select to authenticated using (public.can_access_set(set_id));

drop policy if exists sets_select on public.sets;
-- (owner check inline: a row being inserted isn't visible to can_access_set() yet, and INSERT … RETURNING needs it)
create policy sets_select on public.sets for select to authenticated using (owner_id = auth.uid() or public.can_access_set(id));
drop policy if exists sets_insert on public.sets;
create policy sets_insert on public.sets for insert to authenticated with check (owner_id = auth.uid() and public.is_app_member());
drop policy if exists sets_update on public.sets;
create policy sets_update on public.sets for update to authenticated using (owner_id = auth.uid() or public.can_access_set(id)) with check (owner_id = auth.uid() or public.can_access_set(id));
drop policy if exists sets_delete on public.sets;
create policy sets_delete on public.sets for delete to authenticated using (owner_id = auth.uid() or public.is_app_admin());

drop policy if exists members_select on public.set_members;
create policy members_select on public.set_members for select to authenticated using (public.can_access_set(set_id));
drop policy if exists members_insert on public.set_members;
create policy members_insert on public.set_members for insert to authenticated with check (public.is_set_owner(set_id));
drop policy if exists members_delete on public.set_members;
create policy members_delete on public.set_members for delete to authenticated
  using (public.is_set_owner(set_id) or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));  -- owners remove anyone; members can leave

drop policy if exists segments_all on public.segments;
create policy segments_all on public.segments for all to authenticated
  using (public.can_access_set(set_id)) with check (public.can_access_set(set_id));

drop policy if exists user_data_own on public.user_data;
create policy user_data_own on public.user_data for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Music files: private bucket, path = <set id>/<segment id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('stageflow-audio', 'stageflow-audio', false)
on conflict (id) do nothing;

drop policy if exists stageflow_audio_rw on storage.objects;
create policy stageflow_audio_rw on storage.objects for all to authenticated
  using (bucket_id = 'stageflow-audio' and public.can_access_set(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'stageflow-audio' and public.can_access_set(((storage.foldername(name))[1])::uuid));
