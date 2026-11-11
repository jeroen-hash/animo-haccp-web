-- Seed three rows as the database owner, then exercise policies as authenticated users.
insert into public.food_waste_entries (
  business_id, client_id, created_by, employee_name, product_name,
  quantity, input_unit, reason, note, photo_path, cost_status, client_created_at
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'Medewerker 1', 'Kipfilet',
   750, 'g', 'Product bedorven', '', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001.jpg',
   'unknown', now()),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000002',
   '33333333-3333-4333-8333-333333333333', 'Eigenaar', 'Tomaten',
   1, 'kg', 'Te veel bereid', '', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/33333333-3333-4333-8333-333333333333/aaaaaaaa-0000-4000-8000-000000000002.jpg',
   'unknown', now()),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000003',
   '44444444-4444-4444-8444-444444444444', 'Medewerker B', 'Melk',
   1, 'l', 'Houdbaarheid verstreken', '', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/44444444-4444-4444-8444-444444444444/bbbbbbbb-0000-4000-8000-000000000003.jpg',
   'unknown', now());

insert into storage.objects (bucket_id, name, metadata) values
  ('food-waste-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000001.jpg', '{}'::jsonb),
  ('food-waste-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/33333333-3333-4333-8333-333333333333/aaaaaaaa-0000-4000-8000-000000000002.jpg', '{}'::jsonb),
  ('food-waste-photos', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/44444444-4444-4444-8444-444444444444/bbbbbbbb-0000-4000-8000-000000000003.jpg', '{}'::jsonb);

-- Employee sees only their own row in their own business.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare n integer;
begin
  select count(*) into n from public.food_waste_entries
  where business_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if n <> 1 then raise exception 'Employee should see exactly one own entry, got %', n; end if;

  select count(*) into n from storage.objects where bucket_id = 'food-waste-photos';
  if n <> 1 then raise exception 'Employee should see only own photo, got %', n; end if;
end $$;

-- Employee can upload only into their own uploader folder.
insert into storage.objects (bucket_id, name, metadata)
values (
  'food-waste-photos',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000004.jpg',
  '{}'::jsonb
);

-- Employee can create a record linked to their own private photo path.
insert into public.food_waste_entries (
  business_id, client_id, created_by, product_name, quantity, input_unit,
  reason, photo_path, cost_status, client_created_at
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000004',
  '11111111-1111-4111-8111-111111111111',
  'Komkommer', 250, 'g', 'Beschadigd product',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000004.jpg',
  'unknown', now()
);

-- A retry/upsert can update the uploader's own object.
do $$
declare n integer;
begin
  update storage.objects
  set metadata = '{"retry": true}'::jsonb
  where bucket_id = 'food-waste-photos'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000004.jpg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Uploader retry update should affect one photo, got %', n; end if;
end $$;

-- Employees cannot forge another creator or write into a different business.
do $$
begin
  begin
    insert into public.food_waste_entries (
      business_id, client_id, created_by, product_name, quantity, input_unit,
      reason, photo_path, cost_status, client_created_at
    ) values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'aaaaaaaa-0000-4000-8000-000000000005',
      '22222222-2222-4222-8222-222222222222',
      'Forged', 1, 'stuk', 'Product bedorven',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/aaaaaaaa-0000-4000-8000-000000000005.jpg',
      'unknown', now()
    );
    raise exception 'Expected RLS to reject forged creator';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.food_waste_entries (
      business_id, client_id, created_by, product_name, quantity, input_unit,
      reason, photo_path, cost_status, client_created_at
    ) values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'bbbbbbbb-0000-4000-8000-000000000005',
      '11111111-1111-4111-8111-111111111111',
      'Cross tenant', 1, 'stuk', 'Product bedorven',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/11111111-1111-4111-8111-111111111111/bbbbbbbb-0000-4000-8000-000000000005.jpg',
      'unknown', now()
    );
    raise exception 'Expected RLS to reject cross-tenant insert';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values (
      'food-waste-photos',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/33333333-3333-4333-8333-333333333333/forged.jpg'
    );
    raise exception 'Expected Storage RLS to reject another uploader folder';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Employees cannot void records; RLS returns no updated row.
do $$
declare n integer;
begin
  update public.food_waste_entries
  set voided_at = now(), void_reason = 'Medewerker mag dit niet'
  where client_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Employee unexpectedly updated a waste entry'; end if;
end $$;

-- Employee has no column-level permission to rewrite historic product details.
do $$
begin
  begin
    update public.food_waste_entries
    set product_name = 'Gewijzigd'
    where client_id = 'aaaaaaaa-0000-4000-8000-000000000001';
    raise exception 'Expected column privilege check to reject product rewrite';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Manager can read all entries and photos in their business, and can void an entry.
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
declare n integer;
begin
  select count(*) into n from public.food_waste_entries
  where business_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if n <> 3 then raise exception 'Manager should see all three business A entries, got %', n; end if;

  select count(*) into n from storage.objects where bucket_id = 'food-waste-photos';
  if n <> 3 then raise exception 'Manager should see all business A photos, got %', n; end if;
end $$;

do $$
declare n integer;
begin
  update public.food_waste_entries
  set voided_at = now(), void_reason = 'Controlecorrectie'
  where client_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Manager should void one entry, got %', n; end if;
end $$;

do $$
begin
  begin
    update public.food_waste_entries
    set voided_at = null, void_reason = null
    where client_id = 'aaaaaaaa-0000-4000-8000-000000000001';
    raise exception using errcode = 'P0001', message = 'Expected voided entry to be immutable';
  exception when check_violation then null;
  end;

  begin
    update public.food_waste_entries
    set void_reason = 'Gewijzigde reden'
    where client_id = 'aaaaaaaa-0000-4000-8000-000000000001';
    raise exception using errcode = 'P0001', message = 'Expected void reason to be immutable';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- A user in business B cannot see business A rows or photos.
set role authenticated;
set request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
declare n integer;
begin
  select count(*) into n from public.food_waste_entries
  where business_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if n <> 0 then raise exception 'Cross-tenant user can see business A entries'; end if;

  select count(*) into n from storage.objects
  where bucket_id = 'food-waste-photos'
    and (storage.foldername(name))[1] = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  if n <> 0 then raise exception 'Cross-tenant user can see business A photos'; end if;
end $$;
reset role;

-- The table exposes no anonymous access and no direct delete permission.
do $$
begin
  if has_table_privilege('anon', 'public.food_waste_entries', 'SELECT') then
    raise exception 'anon unexpectedly has SELECT on food waste entries';
  end if;
  if has_table_privilege('authenticated', 'public.food_waste_entries', 'DELETE') then
    raise exception 'authenticated unexpectedly has DELETE on food waste entries';
  end if;
  if has_table_privilege('authenticated', 'public.food_waste_entries', 'TRUNCATE') then
    raise exception 'authenticated unexpectedly has TRUNCATE on food waste entries';
  end if;
  if has_table_privilege('authenticated', 'public.food_waste_entries', 'UPDATE') then
    raise exception 'authenticated unexpectedly has broad table-level UPDATE';
  end if;
  if not has_column_privilege('authenticated', 'public.food_waste_entries', 'voided_at', 'UPDATE') then
    raise exception 'authenticated is missing the intended void column grant';
  end if;
  if has_column_privilege('authenticated', 'public.food_waste_entries', 'product_name', 'UPDATE') then
    raise exception 'authenticated can rewrite product_name';
  end if;
  if has_function_privilege('anon', 'private.prevent_food_waste_unvoid()', 'EXECUTE') then
    raise exception 'anon unexpectedly can execute the private audit trigger function';
  end if;
  if not has_function_privilege('authenticated', 'private.prevent_food_waste_unvoid()', 'EXECUTE') then
    raise exception 'authenticated is missing trigger function execution permission';
  end if;
end $$;

-- Confirm bucket defaults remain private and constrained.
do $$
declare b record;
begin
  select * into b from storage.buckets where id = 'food-waste-photos';
  if not found then raise exception 'Food waste bucket was not created'; end if;
  if b.public is not false then raise exception 'Food waste bucket must be private'; end if;
  if b.file_size_limit <> 5242880 then raise exception 'Unexpected bucket size limit'; end if;
  if cardinality(b.allowed_mime_types) <> 3 then raise exception 'Unexpected bucket MIME allow-list'; end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'food_waste_entries'
      and indexname = 'food_waste_entries_created_by_idx'
  ) then
    raise exception 'Missing index for created_by foreign key';
  end if;
end $$;
