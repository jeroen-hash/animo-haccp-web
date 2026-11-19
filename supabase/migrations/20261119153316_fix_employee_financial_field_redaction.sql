-- Correct case-insensitive recursive redaction for camelCase and snake_case fields.
CREATE OR REPLACE FUNCTION private.employee_strip_financial_fields(p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $$
DECLARE v_result jsonb;
BEGIN
  IF p_value IS NULL THEN RETURN NULL; END IF;
  IF jsonb_typeof(p_value) = 'object' THEN
    SELECT COALESCE(
      jsonb_object_agg(e.key, private.employee_strip_financial_fields(e.value)),
      '{}'::jsonb
    )
    INTO v_result
    FROM jsonb_each(p_value) AS e
    WHERE lower(regexp_replace(e.key, '[^a-z0-9]', '', 'gi'))
      !~ '(price|cost|margin|profit|revenue|turnover|foodcost|vat|tax|discount|financial|sales|payable|receivable|fee|iban|bankaccount|balance|billing|subscription|payment|currency|linetotal|invoicetotal|invoicetax|invoiceamount|invoicesubtotal|grandtotal|subtotal|amounttotal|totalamount|amountdue|amountpaid|amountremaining)'
      AND lower(regexp_replace(e.key, '[^a-z0-9]', '', 'gi')) <> 'total';
    RETURN COALESCE(v_result, '{}'::jsonb);
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    SELECT COALESCE(jsonb_agg(private.employee_strip_financial_fields(a.value)), '[]'::jsonb)
    INTO v_result FROM jsonb_array_elements(p_value) AS a(value);
    RETURN COALESCE(v_result, '[]'::jsonb);
  END IF;
  RETURN p_value;
END;
$$;
