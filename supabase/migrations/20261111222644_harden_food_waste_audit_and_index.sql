-- Harden audit semantics and add the missing FK lookup index.
begin;

create or replace function private.prevent_food_waste_unvoid()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.voided_at is not null then
    if new.voided_at is distinct from old.voided_at
       or new.void_reason is distinct from old.void_reason then
      raise exception using
        errcode = '23514',
        message = 'A voided food-waste entry cannot be changed or restored.';
    end if;
    return new;
  end if;

  if new.voided_at is null or nullif(btrim(new.void_reason), '') is null then
    raise exception using
      errcode = '23514',
      message = 'Voiding requires both a timestamp and a reason.';
  end if;

  new.voided_at := statement_timestamp();
  return new;
end;
$function$;

grant usage on schema private to authenticated;
revoke all on function private.prevent_food_waste_unvoid() from public, anon;
grant execute on function private.prevent_food_waste_unvoid() to authenticated;

do $trigger$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'food_waste_entries_prevent_unvoid'
      and tgrelid = 'public.food_waste_entries'::regclass
      and not tgisinternal
  ) then
    create trigger food_waste_entries_prevent_unvoid
    before update of voided_at, void_reason
    on public.food_waste_entries
    for each row
    execute function private.prevent_food_waste_unvoid();
  end if;
end;
$trigger$;

create index if not exists food_waste_entries_created_by_idx
  on public.food_waste_entries (created_by);

commit;
