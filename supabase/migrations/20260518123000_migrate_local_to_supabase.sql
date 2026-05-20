-- 1. Habilidades
CREATE TABLE skills (
  id          integer PRIMARY KEY,
  nombre      text NOT NULL,
  descripcion text,
  objetivo    text NOT NULL CHECK (objetivo IN ('bug','carta_enemiga','carta_aliada')),
  accion_tipo text NOT NULL CHECK (accion_tipo IN ('APLICAR_ESTADO','DEVOLVER_MANO','DANIO_DIRECTO','CURAR_CORDURA')),
  efecto_tipo text CHECK (efecto_tipo IN ('buff_ataque','debuff_ataque','escudo'))
);

-- 2. Cartas
CREATE TABLE cards (
  id          text PRIMARY KEY,
  nombre      text NOT NULL,
  tipo        text NOT NULL CHECK (tipo IN ('programador','qa','consumible')),
  potencia    integer,
  coste       integer NOT NULL,
  ataque_coste integer,
  cordura_max integer,
  descripcion text,
  image_url   text,
  audio_url   text,
  gacha_peso  integer NOT NULL DEFAULT 1
);

-- 3. Relación carta-habilidad
CREATE TABLE card_skills (
  card_id   text    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  skill_id  integer NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  potencia  integer NOT NULL DEFAULT 0,
  coste     integer NOT NULL DEFAULT 0,
  duracion  integer NOT NULL DEFAULT 0,
  orden     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (card_id, skill_id, orden)
);

-- 3.5. Mazos base (compatibilidad si faltan migraciones previas)
CREATE TABLE IF NOT EXISTS decks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  cover_emoji text NOT NULL DEFAULT '🃏',
  is_preset  boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id   uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  card_id   text NOT NULL,
  quantity  integer NOT NULL CHECK (quantity >= 1),
  PRIMARY KEY (deck_id, card_id)
);

-- 4. Jugadores (reemplaza profiles)
CREATE TABLE players (
  id             uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name   text NOT NULL,
  avatar_url     text,
  gold           integer NOT NULL DEFAULT 300,
  wins           integer NOT NULL DEFAULT 0,
  losses         integer NOT NULL DEFAULT 0,
  active_deck_id uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- 5. Colección del jugador
CREATE TABLE player_collection (
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  card_id   text NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  quantity  integer NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  PRIMARY KEY (player_id, card_id)
);

-- 6. FK de deck_cards hacia cards
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deck_cards'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'deck_cards_card_id_fkey'
  ) THEN
    ALTER TABLE deck_cards
      ADD CONSTRAINT deck_cards_card_id_fkey
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'players'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'decks'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'players_active_deck_id_fkey'
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_active_deck_id_fkey
      FOREIGN KEY (active_deck_id) REFERENCES decks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 7. RLS policies
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cards_read_all" ON cards FOR SELECT USING (true);
CREATE POLICY "skills_read_all" ON skills FOR SELECT USING (true);
CREATE POLICY "card_skills_read_all" ON card_skills FOR SELECT USING (true);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "players_own" ON players
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

ALTER TABLE player_collection ENABLE ROW LEVEL SECURITY;
CREATE POLICY "collection_own" ON player_collection
  FOR ALL USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);

-- Skills
INSERT INTO skills VALUES
  (3, 'Par Programming', 'Aumenta la potencia de una carta aliada este turno.', 'carta_aliada', 'APLICAR_ESTADO', 'buff_ataque'),
  (4, 'QA Testing', 'Devuelve una carta programadora enemiga a la mano del rival.', 'carta_enemiga', 'DEVOLVER_MANO', NULL),
  (5, 'Automatización', 'Inflige daño extra al bug igual a la potencia indicada.', 'bug', 'DANIO_DIRECTO', NULL),
  (6, 'Cafeína', 'Restaura cordura a un aliado.', 'carta_aliada', 'CURAR_CORDURA', NULL),
  (7, 'Motivación', 'Aumenta la potencia de una carta aliada.', 'carta_aliada', 'APLICAR_ESTADO', 'buff_ataque'),
  (8, 'Parche Rápido', 'Inflige daño directo al bug.', 'bug', 'DANIO_DIRECTO', NULL);

-- Cards
INSERT INTO cards (id, nombre, tipo, potencia, coste, ataque_coste, cordura_max, descripcion, gacha_peso) VALUES
  ('junior-dev',   'Junior Dev',              'programador', 1, 1, 1, 2, 'Resuelve bugs simples con entusiasmo.', 60),
  ('mid-dev',      'Mid Dev',                 'programador', 2, 2, 1, 3, 'Experiencia sólida en debugging.', 30),
  ('senior-dev',   'Senior Dev',              'programador', 3, 3, 1, 4, 'Veterano cazador de bugs.', 10),
  ('fullstack',    'Fullstack',               'programador', 2, 2, 1, 3, 'Ataca bugs en frontend y backend.', 30),
  ('devops',       'DevOps',                  'programador', 1, 1, 1, 2, 'Automatiza la destrucción de bugs.', 60),
  ('intern',       'Intern',                  'programador', 1, 1, 1, 2, 'Novato con ganas de aprender.', 60),
  ('architect',    'Architect',               'programador', 3, 2, 0, 5, 'Diseña la solución desde la raíz.', 10),
  ('qa-tester',    'QA Tester',               'qa',          1, 1, 1, 2, 'Devuelve un programador rival a su mano.', 60),
  ('qa-lead',      'QA Lead',                 'qa',          2, 2, 1, 3, 'Limpia la mesa del rival con autoridad.', 30),
  ('cafe-maquina', 'Café de Máquina',         'consumible',  NULL, 1, NULL, NULL, 'Restaura 3 de cordura a un aliado.', 60),
  ('pr-aprobado',  'PR Aprobado',             'consumible',  NULL, 2, NULL, NULL, '+2 potencia a un aliado por 1 turno.', 30),
  ('hotfix',       'Hotfix de Emergencia',    'consumible',  NULL, 2, NULL, NULL, '2 de daño directo al Bug.', 30);

-- Card-Skills
INSERT INTO card_skills (card_id, skill_id, potencia, coste, duracion, orden) VALUES
  ('senior-dev', 3, 2, 2, 1, 0),
  ('fullstack',  3, 1, 1, 1, 0),
  ('devops',     5, 2, 2, 0, 0),
  ('architect',  3, 3, 0, 1, 0),
  ('qa-tester',  4, 0, 1, 0, 0),
  ('qa-lead',    4, 0, 2, 0, 0),
  ('cafe-maquina', 6, 3, 1, 0, 0),
  ('pr-aprobado',  7, 2, 2, 1, 0),
  ('hotfix',       8, 2, 2, 0, 0);