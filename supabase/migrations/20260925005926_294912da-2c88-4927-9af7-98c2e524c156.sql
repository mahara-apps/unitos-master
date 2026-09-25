DO $migration$
DECLARE
  candidate record;
  parsed jsonb;
  extracted text;
  corrected_count integer := 0;
BEGIN
  FOR candidate IN
    SELECT id, design_brief
    FROM public.posts
    WHERE design_brief IS NOT NULL
      AND btrim(design_brief) ~ '^\{\s*"visual_direction"\s*:'
  LOOP
    parsed := NULL;
    extracted := NULL;

    BEGIN
      parsed := btrim(candidate.design_brief)::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      parsed := NULL;
    END;

    IF parsed IS NOT NULL
       AND jsonb_typeof(parsed) = 'object'
       AND jsonb_object_length(parsed) = 1
       AND jsonb_typeof(parsed->'visual_direction') = 'string'
       AND length(btrim(parsed->>'visual_direction')) >= 20 THEN
      extracted := btrim(parsed->>'visual_direction');
    ELSIF btrim(candidate.design_brief) ~ '^\{\s*"visual_direction"\s*:\s*"[\s\S]*"\s*\}$'
       AND btrim(candidate.design_brief) !~ '"\s*,\s*"[^"\r\n]+"\s*:' THEN
      extracted := btrim(
        substring(
          btrim(candidate.design_brief)
          from '^\{\s*"visual_direction"\s*:\s*"([\s\S]*)"\s*\}$'
        )
      );
      IF length(coalesce(extracted, '')) < 20 THEN
        extracted := NULL;
      END IF;
    END IF;

    IF extracted IS NOT NULL AND extracted IS DISTINCT FROM candidate.design_brief THEN
      UPDATE public.posts
      SET design_brief = extracted
      WHERE id = candidate.id
        AND design_brief = candidate.design_brief;
      IF FOUND THEN
        corrected_count := corrected_count + 1;
      END IF;
    END IF;
  END LOOP;

  RAISE NOTICE 'design_brief envelopes corrected: %', corrected_count;
END
$migration$;