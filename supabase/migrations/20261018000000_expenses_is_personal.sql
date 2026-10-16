-- "הוצאות אישיות לבית" — per explicit request, expenses marked "אישי" are
-- now actually saved (not discarded) so they can be tracked and filtered
-- separately from business expenses in the Excel export. Defaults to
-- false so every pre-existing row (all business, since personal rows were
-- previously thrown away on import) keeps reading as business.
alter table public.expenses
  add column if not exists is_personal boolean not null default false;
