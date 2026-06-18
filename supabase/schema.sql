create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'leader', 'cs');
create type public.announcement_status as enum ('draft', 'published', 'completed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skypebot_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cs_names (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  broadcast_id text not null unique check (broadcast_id ~ '^ICB-[A-Z0-9]{6}$'),
  title text not null,
  message text not null,
  status public.announcement_status not null default 'draft',
  skypebot_group_ids uuid[] not null default '{}',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  completed_at timestamptz,
  completed_by_profile uuid references public.profiles(id),
  completed_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.completion_logs (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  completed_by_profile uuid references public.profiles(id),
  completed_by_name text not null,
  completed_at timestamptz not null default now()
);

create table public.announcement_versions (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  broadcast_id text not null,
  title text not null,
  message text not null,
  status public.announcement_status not null,
  skypebot_group_ids uuid[] not null default '{}',
  changed_by uuid references public.profiles(id),
  change_type text not null,
  changed_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger skypebot_groups_updated_at
before update on public.skypebot_groups
for each row execute function public.set_updated_at();

create trigger cs_names_updated_at
before update on public.cs_names
for each row execute function public.set_updated_at();

create trigger announcements_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

create or replace function public.log_announcement_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.announcement_versions (
      announcement_id, broadcast_id, title, message, status, skypebot_group_ids, changed_by, change_type
    )
    values (
      new.id, new.broadcast_id, new.title, new.message, new.status, new.skypebot_group_ids,
      coalesce(new.updated_by, new.created_by, new.published_by, new.completed_by_profile),
      'created'
    );
    return new;
  end if;

  if (
    old.title is distinct from new.title or
    old.message is distinct from new.message or
    old.status is distinct from new.status or
    old.skypebot_group_ids is distinct from new.skypebot_group_ids
  ) then
    insert into public.announcement_versions (
      announcement_id, broadcast_id, title, message, status, skypebot_group_ids, changed_by, change_type
    )
    values (
      new.id, new.broadcast_id, new.title, new.message, new.status, new.skypebot_group_ids,
      coalesce(new.updated_by, new.published_by, new.completed_by_profile, new.created_by),
      case
        when old.status is distinct from new.status then 'status_changed'
        else 'edited'
      end
    );
  end if;

  return new;
end;
$$;

create trigger announcements_version_insert
after insert on public.announcements
for each row execute function public.log_announcement_version();

create trigger announcements_version_update
after update on public.announcements
for each row execute function public.log_announcement_version();

create or replace function public.current_role()
returns public.app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_editor()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_role() in ('admin', 'leader');
$$;

create or replace function public.complete_announcement(p_announcement_id uuid, p_cs_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if public.current_role() <> 'cs' then
    raise exception 'Only CS users can complete broadcasts.';
  end if;

  if not exists (select 1 from public.cs_names where name = p_cs_name and active = true) then
    raise exception 'Please select an active CS name.';
  end if;

  update public.announcements
  set
    status = 'completed',
    completed_at = now(),
    completed_by_profile = auth.uid(),
    completed_by_name = p_cs_name
  where id = p_announcement_id
    and status = 'published';

  if not found then
    raise exception 'This broadcast is not available for completion.';
  end if;

  insert into public.completion_logs (announcement_id, completed_by_profile, completed_by_name)
  values (p_announcement_id, auth.uid(), p_cs_name);
end;
$$;

alter table public.profiles enable row level security;
alter table public.skypebot_groups enable row level security;
alter table public.cs_names enable row level security;
alter table public.announcements enable row level security;
alter table public.completion_logs enable row level security;
alter table public.announcement_versions enable row level security;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.skypebot_groups to authenticated;
grant select, insert, update on public.cs_names to authenticated;
grant select, insert, update, delete on public.announcements to authenticated;
grant select on public.completion_logs to authenticated;
grant select on public.announcement_versions to authenticated;

create policy "profiles select self or editor"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_editor());

create policy "profiles admin update"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "groups select authenticated"
on public.skypebot_groups for select
to authenticated
using (true);

create policy "groups editor insert"
on public.skypebot_groups for insert
to authenticated
with check (public.is_editor());

create policy "groups editor update"
on public.skypebot_groups for update
to authenticated
using (public.is_editor())
with check (public.is_editor());

create policy "cs names select authenticated"
on public.cs_names for select
to authenticated
using (true);

create policy "cs names editor insert"
on public.cs_names for insert
to authenticated
with check (public.is_editor());

create policy "cs names editor update"
on public.cs_names for update
to authenticated
using (public.is_editor())
with check (public.is_editor());

create policy "announcements editor select all"
on public.announcements for select
to authenticated
using (public.is_editor());

create policy "announcements cs select published"
on public.announcements for select
to authenticated
using (public.current_role() = 'cs' and status = 'published');

create policy "announcements editor insert"
on public.announcements for insert
to authenticated
with check (public.is_editor());

create policy "announcements editor update"
on public.announcements for update
to authenticated
using (public.is_editor())
with check (public.is_editor());

create policy "announcements editor delete"
on public.announcements for delete
to authenticated
using (public.is_editor());

create policy "completion logs editor select"
on public.completion_logs for select
to authenticated
using (public.is_editor());

create policy "announcement versions editor select"
on public.announcement_versions for select
to authenticated
using (public.is_editor());

grant execute on function public.complete_announcement(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;
end $$;

-- Create the first admin manually in Supabase Auth, then run this with that user's UUID.
-- insert into public.profiles (id, email, name, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin@example.com', 'Main Admin', 'admin');
