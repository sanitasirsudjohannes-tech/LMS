-- Sinkronisasi timer materi dengan waktu database.
-- Aman dijalankan ulang melalui Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.lms_server_now()
RETURNS TIMESTAMPTZ
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT clock_timestamp();
$$;

REVOKE ALL ON FUNCTION public.lms_server_now() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lms_server_now() TO authenticated;

COMMIT;
