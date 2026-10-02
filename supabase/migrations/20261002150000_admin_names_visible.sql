-- Authors should see who is handling their ticket ("Handled by Riya Mehta"),
-- but not staff email addresses. Column-level privileges expose only the
-- name; the admin directory with emails is served by an admin-only endpoint.
revoke select on public.admins from authenticated;
grant select (user_id, name) on public.admins to authenticated;

drop policy "admins: admin only" on public.admins;
create policy "admins: names visible to signed-in users" on public.admins
  for select to authenticated using (true);
