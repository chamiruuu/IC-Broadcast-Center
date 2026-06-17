alter table public.announcements
add column if not exists published_by uuid references public.profiles(id);

update public.announcements
set published_by = coalesce(published_by, updated_by, created_by)
where status in ('published', 'completed');

drop policy if exists "profiles select self or admin" on public.profiles;
drop policy if exists "profiles select self or editor" on public.profiles;

create policy "profiles select self or editor"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_editor());

notify pgrst, 'reload schema';
