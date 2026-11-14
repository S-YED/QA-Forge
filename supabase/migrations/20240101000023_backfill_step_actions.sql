-- CON-1/CON-2: every test step now carries an explicit `action` (TD-1). This backfills
-- `action` on existing test_cases.steps from the first word of `instruction`.
-- Steps whose verb can't be mapped are left without `action`: the API and runner reject
-- them, so they surface as "needs fix" instead of silently clicking.
-- Idempotent: steps that already have `action` are untouched.

CREATE FUNCTION pg_temp.qf_backfill_step(s jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  instr text := btrim(coalesce(s->>'instruction', ''));
  verb  text := lower(split_part(instr, ' ', 1));
  val   text := s->>'value';
  act   text;
  label text;
BEGIN
  IF s ? 'action' THEN RETURN s; END IF;

  act := CASE
    WHEN verb IN ('navigate', 'go', 'goto', 'open', 'visit', 'load') THEN 'navigate'
    WHEN verb IN ('click', 'tap') THEN 'click'
    WHEN verb IN ('fill', 'type', 'enter', 'input') THEN 'fill'
    WHEN verb IN ('select', 'choose') THEN 'select'
    WHEN verb = 'hover' THEN 'hover'
    WHEN verb = 'press' THEN 'press'
    WHEN verb IN ('wait', 'wait_for') THEN 'wait_for'
    WHEN verb = 'scroll' THEN 'scroll'
    WHEN verb IN ('assert', 'verify', 'check', 'expect', 'ensure', 'confirm') THEN
      CASE
        WHEN lower(instr) LIKE '%url%' THEN 'assert_url'
        WHEN val IS NULL OR lower(val) = 'visible' THEN 'assert_visible'
        ELSE 'assert_text'
      END
  END;

  IF act IS NULL THEN RETURN s; END IF;

  s := s || jsonb_build_object('action', act);
  IF act = 'assert_visible' THEN s := s - 'value'; END IF;

  -- Old seeds used a bare verb as the instruction; give those a readable description.
  IF instr ~* '^[a-z_]+$' THEN
    label := replace(act, '_', ' ');
    label := upper(left(label, 1)) || substr(label, 2)
             || coalesce(' ' || (s->>'selector'), '')
             || CASE WHEN act IN ('navigate', 'press', 'assert_url') THEN coalesce(' ' || (s->>'value'), '') ELSE '' END;
    s := s || jsonb_build_object('instruction', label);
  END IF;

  RETURN s;
END $$;

UPDATE public.test_cases tc
SET steps = (
  SELECT jsonb_agg(pg_temp.qf_backfill_step(e.s) ORDER BY e.ord)
  FROM jsonb_array_elements(tc.steps) WITH ORDINALITY AS e(s, ord)
)
WHERE jsonb_typeof(tc.steps) = 'array'
  AND EXISTS (SELECT 1 FROM jsonb_array_elements(tc.steps) x WHERE NOT x ? 'action');

-- Run results: `action` will hold the enum value, `instruction` the description (EXE-1).
ALTER TABLE public.test_steps ADD COLUMN IF NOT EXISTS instruction TEXT;

-- Post-deploy check (read-only): cases with steps still needing a manual fix.
-- SELECT id, title FROM public.test_cases
-- WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(steps) x WHERE NOT x ? 'action');
