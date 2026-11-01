-- A contagem por empresa era actualizada em cada linha, no meio da gravacao.
-- Quem importava documentos ou notas segurava essa linha ate ao fim (dezenas
-- de segundos). A importacao de recebimentos esperava, batia no lock_timeout
-- (30s) e era cancelada. O ajuste da contagem passa a ocorrer so no commit.

BEGIN;

DROP TRIGGER IF EXISTS iso_pro_documentos_contagens_ai ON public.iso_pro_documentos_planejamento;
DROP TRIGGER IF EXISTS iso_pro_documentos_contagens_ad ON public.iso_pro_documentos_planejamento;
DROP TRIGGER IF EXISTS iso_pro_recebimentos_contagens_ai ON public.iso_pro_recebimentos;
DROP TRIGGER IF EXISTS iso_pro_recebimentos_contagens_ad ON public.iso_pro_recebimentos;
DROP TRIGGER IF EXISTS iso_pro_materiais_contagens_ai ON public.materiais;
DROP TRIGGER IF EXISTS iso_pro_materiais_contagens_ad ON public.materiais;

CREATE CONSTRAINT TRIGGER iso_pro_documentos_contagens_ai
  AFTER INSERT ON public.iso_pro_documentos_planejamento
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('documentos_planejamento');

CREATE CONSTRAINT TRIGGER iso_pro_documentos_contagens_ad
  AFTER DELETE ON public.iso_pro_documentos_planejamento
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('documentos_planejamento');

CREATE CONSTRAINT TRIGGER iso_pro_recebimentos_contagens_ai
  AFTER INSERT ON public.iso_pro_recebimentos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('recebimentos');

CREATE CONSTRAINT TRIGGER iso_pro_recebimentos_contagens_ad
  AFTER DELETE ON public.iso_pro_recebimentos
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('recebimentos');

CREATE CONSTRAINT TRIGGER iso_pro_materiais_contagens_ai
  AFTER INSERT ON public.materiais
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('materiais');

CREATE CONSTRAINT TRIGGER iso_pro_materiais_contagens_ad
  AFTER DELETE ON public.materiais
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.iso_pro_tenant_contagens_bump('materiais');

COMMIT;
