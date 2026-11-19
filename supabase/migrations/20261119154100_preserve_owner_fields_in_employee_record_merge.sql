-- Preserve owner-only nested fields when an employee syncs an existing operational record.
CREATE OR REPLACE FUNCTION private.employee_merge_preserving_private(p_current jsonb, p_incoming jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_item record;
  v_existing jsonb;
BEGIN
  IF jsonb_typeof(p_current)='object' AND jsonb_typeof(p_incoming)='object' THEN
    v_result:=p_current;
    FOR v_item IN SELECT key,value FROM jsonb_each(p_incoming) LOOP
      IF p_current ? v_item.key THEN
        v_existing:=p_current->v_item.key;
        IF jsonb_typeof(v_existing)='object' AND jsonb_typeof(v_item.value)='object' THEN
          v_result:=jsonb_set(v_result,ARRAY[v_item.key],
            private.employee_merge_preserving_private(v_existing,v_item.value),true);
        ELSIF jsonb_typeof(v_existing)='array' AND jsonb_typeof(v_item.value)='array' THEN
          v_result:=jsonb_set(v_result,ARRAY[v_item.key],
            private.employee_merge_array_preserving_private(v_existing,v_item.value),true);
        ELSE
          v_result:=jsonb_set(v_result,ARRAY[v_item.key],v_item.value,true);
        END IF;
      ELSE
        v_result:=jsonb_set(v_result,ARRAY[v_item.key],v_item.value,true);
      END IF;
    END LOOP;
    RETURN v_result;
  END IF;

  IF jsonb_typeof(p_incoming)='array' THEN
    RETURN private.employee_merge_array_preserving_private(
      CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END,
      p_incoming
    );
  END IF;

  RETURN p_incoming;
END;
$$;

CREATE OR REPLACE FUNCTION private.employee_merge_array_preserving_private(p_current jsonb, p_incoming jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_result jsonb:='[]'::jsonb;
  v_new record;
  v_old record;
  v_existing jsonb;
BEGIN
  FOR v_new IN
    SELECT value,ordinality
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END)
      WITH ORDINALITY AS incoming(value,ordinality)
  LOOP
    v_existing:=NULL;
    IF jsonb_typeof(v_new.value)='object' AND v_new.value->>'id' IS NOT NULL THEN
      SELECT old.value INTO v_existing
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END) old(value)
      WHERE old.value->>'id'=v_new.value->>'id'
      LIMIT 1;
    ELSE
      v_existing:=p_current->((v_new.ordinality-1)::integer);
    END IF;

    IF v_existing IS NOT NULL THEN
      v_result:=v_result||jsonb_build_array(
        private.employee_merge_preserving_private(v_existing,v_new.value)
      );
    ELSE
      v_result:=v_result||jsonb_build_array(v_new.value);
    END IF;
  END LOOP;

  FOR v_old IN
    SELECT value,ordinality
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END)
      WITH ORDINALITY AS old(value,ordinality)
  LOOP
    IF jsonb_typeof(v_old.value)='object' AND v_old.value->>'id' IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END) incoming(value)
        WHERE incoming.value->>'id'=v_old.value->>'id'
      ) THEN
        v_result:=v_result||jsonb_build_array(v_old.value);
      END IF;
    ELSIF v_old.ordinality>jsonb_array_length(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END) THEN
      v_result:=v_result||jsonb_build_array(v_old.value);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION private.employee_merge_records(p_current jsonb, p_incoming jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE v_item jsonb; v_new jsonb; v_result jsonb:='[]'::jsonb;
BEGIN
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END)
  LOOP
    SELECT value INTO v_new
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END)
    WHERE value->>'id'=v_item->>'id'
    LIMIT 1;
    IF FOUND THEN
      v_item:=private.employee_merge_preserving_private(v_item,v_new);
    END IF;
    v_result:=v_result||jsonb_build_array(v_item);
  END LOOP;

  FOR v_new IN
    SELECT value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_incoming)='array' THEN p_incoming ELSE '[]'::jsonb END)
  LOOP
    IF v_new->>'id' IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_current)='array' THEN p_current ELSE '[]'::jsonb END) old
      WHERE old->>'id'=v_new->>'id'
    ) THEN
      v_result:=v_result||jsonb_build_array(v_new);
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;
