-- Free-text extra instructions, always available alongside any style
-- preset (including the new "custom" preset which relies on it entirely),
-- so a preset can be nudged/refined without needing a brand-new preset for
-- every small variation.
ALTER TABLE public.photo_edit_history
  ADD COLUMN IF NOT EXISTS custom_instructions text;
