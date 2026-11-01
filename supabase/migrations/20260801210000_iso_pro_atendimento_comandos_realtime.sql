-- Realtime na tabela de comandos: o browser confirma o COMMIT via WebSocket
-- sem ficar preso atras da resposta HTTP lenta do RPC (canteiro).

BEGIN;

ALTER TABLE public.iso_pro_atendimento_comandos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.iso_pro_atendimento_comandos;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

COMMIT;
