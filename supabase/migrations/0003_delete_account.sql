-- Account deletion, which Google Play requires in the app. Every table in
-- 0001/0002 references auth.users (id) on delete cascade, so deleting the
-- caller's auth row removes every row they own.
--
-- security definer: the authenticated role cannot delete from auth.users
-- itself. search_path is empty so nothing in the caller's path can shadow
-- auth.users. auth.uid() is null for an anonymous caller, so the delete
-- matches nothing even if the grant below were wrong.
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
