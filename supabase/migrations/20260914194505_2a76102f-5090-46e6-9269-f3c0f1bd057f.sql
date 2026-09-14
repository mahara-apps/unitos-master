CREATE OR REPLACE FUNCTION public.seal_installation_operation_baseline(
  _operation_id uuid,
  _owner text,
  _fencing_token bigint,
  _baseline_id text,
  _baseline_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _sealed boolean;
BEGIN
  IF nullif(btrim(_baseline_id), '') IS NULL OR _baseline_hash COLLATE "C" !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Snapshot do pacote inválido' USING ERRCODE = '22023';
  END IF;

  UPDATE public.installation_operations
  SET baseline_id = _baseline_id,
      baseline_hash = _baseline_hash,
      heartbeat_at = now(),
      last_report_at = now()
  WHERE id = _operation_id
    AND status = 'running'
    AND lease_owner = _owner
    AND fencing_token = _fencing_token
    AND lease_expires_at > now()
    AND (baseline_id IS NULL OR baseline_id = _baseline_id)
    AND (baseline_hash IS NULL OR baseline_hash = _baseline_hash)
  RETURNING true INTO _sealed;

  RETURN coalesce(_sealed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.seal_installation_operation_baseline(uuid,text,bigint,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seal_installation_operation_baseline(uuid,text,bigint,text,text) TO service_role;