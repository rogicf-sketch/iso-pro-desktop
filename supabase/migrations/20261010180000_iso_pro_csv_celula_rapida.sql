-- Export Excel: célula e decimal em expressão única para o Postgres embutir na consulta.
-- Texto limpo não passa por regexp. O resultado continua igual ao da função anterior.

BEGIN;

CREATE OR REPLACE FUNCTION public.iso_pro_csv_cell(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL OR p = '' THEN ''
    WHEN strpos(p, E'\n') = 0
     AND strpos(p, E'\r') = 0
     AND strpos(p, ';') = 0
     AND strpos(p, '"') = 0
     AND p = btrim(p)
    THEN p
    WHEN btrim(regexp_replace(p, E'[\r\n]+', ' ', 'g')) = '' THEN ''
    WHEN btrim(regexp_replace(p, E'[\r\n]+', ' ', 'g')) ~ '[;"]'
      THEN '"' || replace(btrim(regexp_replace(p, E'[\r\n]+', ' ', 'g')), '"', '""') || '"'
    ELSE btrim(regexp_replace(p, E'[\r\n]+', ' ', 'g'))
  END;
$$;

CREATE OR REPLACE FUNCTION public.iso_pro_fmt_decimal_pt(p numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL OR p = 0 THEN '0'
    WHEN trim(trailing '0' FROM trim(trailing '.' FROM round(p, 6)::text)) IS NULL
      OR trim(trailing '0' FROM trim(trailing '.' FROM round(p, 6)::text)) IN ('', '-')
      THEN '0'
    ELSE replace(trim(trailing '0' FROM trim(trailing '.' FROM round(p, 6)::text)), '.', ',')
  END;
$$;

COMMENT ON FUNCTION public.iso_pro_csv_cell(text) IS
  'Escapa célula CSV. Texto limpo sai direto; ; " e quebra de linha continuam escapados.';

NOTIFY pgrst, 'reload schema';

COMMIT;
