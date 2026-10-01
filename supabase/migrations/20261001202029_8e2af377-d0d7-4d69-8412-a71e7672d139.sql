ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS source_ai_job_id uuid REFERENCES public.ai_jobs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS posts_source_ai_job_unique_idx
  ON public.posts (source_ai_job_id)
  WHERE source_ai_job_id IS NOT NULL;