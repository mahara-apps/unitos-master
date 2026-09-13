ALTER TABLE public.installation_operations
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

DROP INDEX IF EXISTS public.installation_operations_resume_idx;

CREATE INDEX IF NOT EXISTS installation_operations_resume_idx
  ON public.installation_operations (next_attempt_at, lease_expires_at, created_at)
  WHERE status IN ('pending', 'running', 'retryable');