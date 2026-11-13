-- Exercise the deployed RPC with synthetic data; always roll back all changes.
begin;
do $$
declare
  staff_id uuid;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  registered_id uuid;
begin
  select id into staff_id from public.profiles where active and role = 'admin' limit 1;
  if staff_id is null then raise exception 'No active admin available for verification'; end if;
  perform set_config('request.jwt.claim.sub', staff_id::text, true);
  registered_id := public.register_staff_decision('Verificacao temporaria de cadastro', '+5511000000000', 'acceptance', false, false, false, today, null);
  if not exists (select 1 from public.follow_ups where decision_id = registered_id) then
    raise exception 'Missing follow-up';
  end if;
  begin
    perform public.register_staff_decision('Verificacao temporaria de cadastro', '+5511000000000', 'acceptance', false, false, false, today + 1, null);
    raise exception 'Future date unexpectedly accepted';
  exception when invalid_parameter_value then
    raise notice 'Future date correctly rejected';
  end;
  raise notice 'Registration with Sao Paulo date succeeded; transaction will be rolled back';
end;
$$;
rollback;
