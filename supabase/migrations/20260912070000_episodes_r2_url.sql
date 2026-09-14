/*
  # Give episodes their own r2_url

  Groups -> episode view could already tell you a video was "in R2" (r2_key),
  but never showed the URL itself -- that only ever lived on the matching
  `downloads` row, one join away. Mirroring the same r2_key/r2_url pair
  already on `downloads` and `url_list_items` onto `episodes` means every
  place a video ends up in R2 -- a Telegram download or a manual upload from
  the panel -- carries a ready-to-copy URL right on the episode itself.

  1. Changes to `episodes`
    - `r2_url` (text) — public URL, null when no public URL is configured

  2. Security
    - No policy changes: the table's existing RLS still applies.
*/

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS r2_url text;
