grant delete on public.announcements to authenticated;

create policy "announcements editor delete"
on public.announcements for delete
to authenticated
using (public.is_editor());
