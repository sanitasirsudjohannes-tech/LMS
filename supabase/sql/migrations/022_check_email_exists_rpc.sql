-- Migration 022: Fungsi RPC untuk memeriksa keberadaan email peserta (Bypass RLS secara aman)
-- Supabase SQL Editor execution script

CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE LOWER(email) = LOWER(TRIM(p_email))
  );
END;
$$;

-- Berikan izin eksekusi ke peran anonim dan authenticated
GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon, authenticated, service_role;
