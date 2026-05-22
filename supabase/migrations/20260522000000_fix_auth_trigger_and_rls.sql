-- ============================================================
-- Fix: Drop stale trigger/function referencing dropped "profiles" table
-- This was causing 500 errors on user signup and anonymous sign-in.
-- ============================================================

-- 1. Drop the trigger that fires on new auth user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop the function it called (references the removed profiles table)
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ============================================================
-- Fix: Enable RLS on tables that have policies but missing ENABLE
-- ============================================================

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_skills ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Fix: Add RLS and policies for decks / deck_cards
-- ============================================================

ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_cards ENABLE ROW LEVEL SECURITY;

-- Users can read/write their own decks
CREATE POLICY "decks_own" ON decks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow reading preset decks (is_preset = true) for everyone
CREATE POLICY "decks_preset_read" ON decks
  FOR SELECT USING (is_preset = true);

-- Users can manage cards in their own decks
CREATE POLICY "deck_cards_own" ON deck_cards
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM decks WHERE decks.id = deck_cards.deck_id AND decks.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM decks WHERE decks.id = deck_cards.deck_id AND decks.user_id = auth.uid())
  );

-- Allow reading cards from preset decks
CREATE POLICY "deck_cards_preset_read" ON deck_cards
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM decks WHERE decks.id = deck_cards.deck_id AND decks.is_preset = true)
  );
