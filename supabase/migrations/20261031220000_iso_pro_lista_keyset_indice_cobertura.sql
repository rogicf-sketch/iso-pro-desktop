-- Escala 200k+ desenhos: OFFSET na pag. 900+ continua O(n).
-- Indice de cobertura (tenant, numero, id) para seek keyset e salto profundo so em ids.

BEGIN;

CREATE INDEX IF NOT EXISTS iso_pro_documentos_planejamento_tenant_numero_id_idx
  ON public.iso_pro_documentos_planejamento (tenant_id, numero, id);

COMMENT ON INDEX public.iso_pro_documentos_planejamento_tenant_numero_id_idx IS
  'Lista planejamento: keyset (numero,id) e OFFSET so sobre o indice (200k+).';

COMMIT;
