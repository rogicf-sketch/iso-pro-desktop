-- CSV cells sem quebras de linha (quebravam o parse no browser → fallback JSON ~+20s).
BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_csv_cell(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN ''
    ELSE (
      SELECT CASE
        WHEN s = '' THEN ''
        WHEN s ~ '[;"]' THEN '"' || replace(s, '"', '""') || '"'
        ELSE s
      END
      FROM (
        SELECT trim(both FROM regexp_replace(p, E'[\r\n]+', ' ', 'g')) AS s
      ) q
    )
  END;
$$;

COMMENT ON FUNCTION public.iso_pro_csv_cell(text) IS
  'Escapa célula CSV (;/" ) e colapsa CR/LF para não partir linhas no cliente.';

COMMIT;
