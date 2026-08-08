set local request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
set local request.jwt.claim.role = 'authenticated';
select auth.uid() as auth_uid;
select current_setting('request.jwt.claim.sub', true) as claim_sub;
select public.current_app_role() as app_role;
select public.has_role(array['admin','staff','cook','barista']::public.user_role[]) as has_any_role;
select count(*) as cafe_queue_count from public.v_cafe_queue;
