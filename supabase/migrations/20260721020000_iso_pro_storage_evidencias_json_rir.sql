-- Permitir JSON no bucket evidencias (payload completo RIR offloaded da base 8 GB).
BEGIN;

UPDATE storage.buckets
SET
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/jpg',
    'application/json'
  ]::text[],
  file_size_limit = 20971520 -- 20 MB (JSON RIR grande + margem)
WHERE id = 'evidencias';

COMMIT;
