-- StageFlow Cloud — database schema for Supabase
-- Run once in your Supabase project: Dashboard → SQL Editor → paste this file → Run.
-- Safe to run again (it only creates what is missing).
--
-- Model: choreographers sign in; a set belongs to its owner and can be shared with other
-- choreographers by email. Dancers never sign in (they use share links).

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

-- ---------------------------------------------------------------------------
-- Who may see a set: its owner, or anyone invited with the email they signed in with
-- ---------------------------------------------------------------------------
create or replace function public.can_access_set(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sets s where s.id = sid and s.owner_id = auth.uid())
      or exists (select 1 from public.set_members m
                 where m.set_id = sid and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

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
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.sets        enable row level security;
alter table public.set_members enable row level security;
alter table public.segments    enable row level security;
alter table public.user_data   enable row level security;

drop policy if exists sets_select on public.sets;
-- (owner check inline: a row being inserted isn't visible to can_access_set() yet, and INSERT … RETURNING needs it)
create policy sets_select on public.sets for select to authenticated using (owner_id = auth.uid() or public.can_access_set(id));
drop policy if exists sets_insert on public.sets;
create policy sets_insert on public.sets for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists sets_update on public.sets;
create policy sets_update on public.sets for update to authenticated using (owner_id = auth.uid() or public.can_access_set(id)) with check (owner_id = auth.uid() or public.can_access_set(id));
drop policy if exists sets_delete on public.sets;
create policy sets_delete on public.sets for delete to authenticated using (owner_id = auth.uid());

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
