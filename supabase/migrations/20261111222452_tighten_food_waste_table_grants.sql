-- Remove Supabase project's inherited broad default grants from this new table.
-- Keep only the least-privilege operations required by the food-waste module.
begin;

revoke all privileges on table public.food_waste_entries
  from public, anon, authenticated;

grant select, insert on table public.food_waste_entries to authenticated;
grant update (voided_at, void_reason)
  on table public.food_waste_entries to authenticated;
grant all on table public.food_waste_entries to service_role;

commit;
