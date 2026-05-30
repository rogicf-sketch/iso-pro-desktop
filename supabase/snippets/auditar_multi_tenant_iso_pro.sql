-- =============================================================================
-- I.S.O PRO — Auditoria multi-tenant (executar no SQL Editor)
-- =============================================================================
-- Lista constraints/indexes que podem bloquear a segunda empresa ou dados partilhados
-- indevidamente entre tenants.
-- =============================================================================

-- 1) PK e UNIQUE em tabelas com tenant_id
SELECT
  t.relname AS tabela,
  c.conname AS constraint,
  c.contype AS tipo,
  pg_get_constraintdef(c.oid) AS definicao
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND c.contype IN ('p', 'u')
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = t.relname
      AND col.column_name = 'tenant_id'
  )
ORDER BY t.relname, c.contype, c.conname;

-- 2) Indexes UNIQUE sem tenant_id em tabelas multi-tenant (suspeitos)
SELECT
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND i.indexdef ILIKE '%UNIQUE%'
  AND i.indexdef NOT ILIKE '%tenant_id%'
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns col
    WHERE col.table_schema = 'public'
      AND col.table_name = i.tablename
      AND col.column_name = 'tenant_id'
  )
ORDER BY i.tablename, i.indexname;

-- 3) Contagem por tenant (materiais, snapshot, utilizadores)
SELECT 'materiais' AS fonte, tenant_id::text, count(*)::bigint AS total
FROM public.materiais
GROUP BY tenant_id
UNION ALL
SELECT 'iso_pro_snapshot', tenant_id::text, 1
FROM public.iso_pro_snapshot
WHERE id = 'default'
UNION ALL
SELECT 'usuarios_sistema', tenant_id::text, count(*)::bigint
FROM public.usuarios_sistema
GROUP BY tenant_id
ORDER BY fonte, tenant_id;

-- 4) Referencias orfas no snapshot (planejamento vs atendimento)
WITH snap AS (
  SELECT payload
  FROM public.iso_pro_snapshot
  WHERE id = 'default'
  LIMIT 1
),
docs AS (
  SELECT trim(d->>'id') AS id, lower(trim(d->>'numero')) AS num
  FROM snap, jsonb_array_elements(COALESCE(snap.payload->'documentos', '[]'::jsonb)) d
),
refs AS (
  SELECT 'historico' AS origem, trim(h->>'documentoId') AS id, lower(trim(h->>'documento')) AS num
  FROM snap, jsonb_array_elements(COALESCE(snap.payload->'atendimentoHistorico', '[]'::jsonb)) h
  UNION ALL
  SELECT 'atendimentos', trim(a->>'documentoId'), lower(trim(a->>'documentoNumero'))
  FROM snap, jsonb_array_elements(COALESCE(snap.payload->'atendimentos', '[]'::jsonb)) a
)
SELECT origem, id, num
FROM refs r
WHERE (r.id <> '' AND NOT EXISTS (SELECT 1 FROM docs d WHERE d.id = r.id))
   OR (r.num <> '' AND NOT EXISTS (SELECT 1 FROM docs d WHERE d.num = r.num))
LIMIT 50;
