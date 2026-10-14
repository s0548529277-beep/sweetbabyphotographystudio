-- "פרטים לעיצוב האלבום" — a short form the newborn client fills in on her
-- own gallery page, right after she finishes picking her favorite proof
-- photos (maps onto CLIENT_STEPS step 3, "בחירת כיתובים, תמונות לקולאז'
-- וכריכה" — see gallery-steps.ts). Gives Michal the details she actually
-- needs while designing the album, without a phone call back and forth.
alter table public.newborn_package_orders
  add column if not exists album_child_name text,
  add column if not exists album_birth_weight text,
  add column if not exists album_birth_time text,
  add column if not exists album_birth_date date,
  add column if not exists album_hospital text,
  -- 'hebrew' | 'latin' — caption lettering preference for the album design.
  add column if not exists album_caption_language text check (album_caption_language is null or album_caption_language in ('hebrew', 'latin')),
  add column if not exists album_notes text,
  add column if not exists album_details_submitted_at timestamptz;
