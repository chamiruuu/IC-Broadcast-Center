create table if not exists public.announcement_versions (
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

drop trigger if exists announcements_version_insert on public.announcements;
create trigger announcements_version_insert
after insert on public.announcements
for each row execute function public.log_announcement_version();

drop trigger if exists announcements_version_update on public.announcements;
create trigger announcements_version_update
after update on public.announcements
for each row execute function public.log_announcement_version();

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

alter table public.announcement_versions enable row level security;
grant select on public.announcement_versions to authenticated;

drop policy if exists "announcement versions editor select" on public.announcement_versions;
create policy "announcement versions editor select"
on public.announcement_versions for select
to authenticated
using (public.is_editor());

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

grant execute on function public.complete_announcement(uuid, text) to authenticated;
notify pgrst, 'reload schema';
