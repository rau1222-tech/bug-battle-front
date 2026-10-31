-- Avatars are stored as external image links (no file storage) and kept small.
-- NOT VALID: enforce on new writes without failing on any pre-existing rows.
ALTER TABLE players
  ADD CONSTRAINT players_avatar_url_check
  CHECK (avatar_url IS NULL OR (char_length(avatar_url) <= 2048 AND avatar_url ~* '^https?://'))
  NOT VALID;

ALTER TABLE players
  ADD CONSTRAINT players_display_name_length_check
  CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 40)
  NOT VALID;
