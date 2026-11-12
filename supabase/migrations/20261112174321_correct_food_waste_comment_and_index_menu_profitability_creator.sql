-- Correct the food-waste table description to reflect linked-stock deductions.
-- Add the creator FK index identified during the test-project performance review.
begin;

comment on table public.food_waste_entries is
  'ANIMO HACCP food-waste registrations. Linked stock products are deducted automatically; entries without a valid stock link are recorded without stock deduction.';

create index if not exists menu_profitability_data_created_by_idx
  on public.menu_profitability_data (created_by);

commit;
