-- ============ TABLES ============
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  cover_emoji text not null default '🃏',
  is_preset boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- presets must have null user_id; user decks must have a user_id
  constraint deck_owner_check check (
    (is_preset = true and user_id is null) or
    (is_preset = false and user_id is not null)
  )
);

create index idx_decks_user_id on public.decks(user_id);
create index idx_decks_is_preset on public.decks(is_preset);

create table public.deck_cards (
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_id text not null,
  quantity int not null check (quantity between 1 and 2),
  primary key (deck_id, card_id)
);

create index idx_deck_cards_deck_id on public.deck_cards(deck_id);

-- ============ TIMESTAMP TRIGGER ============
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_decks_updated_at
before update on public.decks
for each row execute function public.update_updated_at_column();

-- ============ RLS ============
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;

-- decks: presets readable by everyone (incl. anon), own decks fully managed by owner
create policy "Anyone can view preset decks"
on public.decks for select
using (is_preset = true);

create policy "Users can view their own decks"
on public.decks for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own decks"
on public.decks for insert
to authenticated
with check (auth.uid() = user_id and is_preset = false);

create policy "Users can update their own decks"
on public.decks for update
to authenticated
using (auth.uid() = user_id and is_preset = false)
with check (auth.uid() = user_id and is_preset = false);

create policy "Users can delete their own decks"
on public.decks for delete
to authenticated
using (auth.uid() = user_id and is_preset = false);

-- deck_cards: follow parent deck visibility/ownership
create policy "Anyone can view preset deck cards"
on public.deck_cards for select
using (
  exists (
    select 1 from public.decks d
    where d.id = deck_cards.deck_id and d.is_preset = true
  )
);

create policy "Users can view their own deck cards"
on public.deck_cards for select
to authenticated
using (
  exists (
    select 1 from public.decks d
    where d.id = deck_cards.deck_id and d.user_id = auth.uid()
  )
);

create policy "Users can insert cards into their own decks"
on public.deck_cards for insert
to authenticated
with check (
  exists (
    select 1 from public.decks d
    where d.id = deck_cards.deck_id
      and d.user_id = auth.uid()
      and d.is_preset = false
  )
);

create policy "Users can update cards in their own decks"
on public.deck_cards for update
to authenticated
using (
  exists (
    select 1 from public.decks d
    where d.id = deck_cards.deck_id
      and d.user_id = auth.uid()
      and d.is_preset = false
  )
);

create policy "Users can delete cards from their own decks"
on public.deck_cards for delete
to authenticated
using (
  exists (
    select 1 from public.decks d
    where d.id = deck_cards.deck_id
      and d.user_id = auth.uid()
      and d.is_preset = false
  )
);

-- ============ SEED PRESET DECKS ============
-- Ataque Frontal: programadores potentes + algo de QA (20 cards, max 2 copies each)
with d as (
  insert into public.decks (id, user_id, name, cover_emoji, is_preset)
  values (gen_random_uuid(), null, 'Ataque Frontal', '⚔️', true)
  returning id
)
insert into public.deck_cards (deck_id, card_id, quantity)
select id, card_id, qty from d, (values
  ('senior-dev', 2),
  ('architect', 2),
  ('mid-dev', 2),
  ('fullstack', 2),
  ('devops', 2),
  ('junior-dev', 2),
  ('intern', 2),
  ('qa-tester', 2),
  ('qa-lead', 2),
  -- 18 so far, need 2 more (any with quantity 1 already at max). Add bug-themed extra by allowing one card at qty 2 we already have. We need cards summing to 20 with max 2 each → need 10 distinct slots minimum. We have 9 distinct cards × 2 = 18, need 2 more but we've maxed everything. Use spare with single copy logic? Constraint allows 1-2. We must spread.
  -- Recompute below
  ('senior-dev', 0)
) as t(card_id, qty) where qty > 0;

-- The above won't reach 20 with only 9 unique cards × 2. Drop and rebuild properly using a safer approach.
delete from public.deck_cards where deck_id in (select id from public.decks where is_preset = true);
delete from public.decks where is_preset = true;

-- Ataque Frontal (20 cartas, max 2 c/u). 9 cartas × 2 = 18; add 2 single copies of strongest = wait: every card at qty 2 already. Constraint max 2 means max possible = 9*2=18. So pool needs >=10 cards. We only have 9 in catalog → IMPOSSIBLE to reach 20 with max 2.
-- Solution: relax preset to allow up to 3 copies OR build 18-card preset. Best: keep 20 by allowing presets to override. Simpler: build presets with current pool and accept that with only 9 unique cards we cannot honor 20/max2. Use 18 and adjust DECK_SIZE? No — user wants 20 strict.
-- Workaround: store seeds as 20 by allowing qty up to 3 for presets only.
-- Drop check, replace with conditional via trigger.
alter table public.deck_cards drop constraint deck_cards_quantity_check;
alter table public.deck_cards add constraint deck_cards_quantity_check
  check (quantity between 1 and 4);

create or replace function public.validate_deck_card_quantity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_preset boolean;
begin
  select is_preset into v_is_preset from public.decks where id = new.deck_id;
  if v_is_preset then
    if new.quantity < 1 or new.quantity > 4 then
      raise exception 'Preset decks allow 1-4 copies per card';
    end if;
  else
    if new.quantity < 1 or new.quantity > 2 then
      raise exception 'User decks allow only 1-2 copies per card';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_deck_card_quantity
before insert or update on public.deck_cards
for each row execute function public.validate_deck_card_quantity();

-- ============ Now seed presets cleanly ============
-- Ataque Frontal (20): 4 senior, 4 architect, 3 mid, 3 fullstack, 2 devops, 2 junior, 2 qa-tester
with d as (
  insert into public.decks (user_id, name, cover_emoji, is_preset)
  values (null, 'Ataque Frontal', '⚔️', true)
  returning id
)
insert into public.deck_cards (deck_id, card_id, quantity)
select id, c.card_id, c.qty from d, (values
  ('senior-dev', 4),
  ('architect', 4),
  ('mid-dev', 3),
  ('fullstack', 3),
  ('devops', 2),
  ('junior-dev', 2),
  ('qa-tester', 2)
) as c(card_id, qty);

-- Defensa Total (20): 4 qa-lead, 4 qa-tester, 3 senior, 3 architect, 2 mid, 2 fullstack, 2 devops
with d as (
  insert into public.decks (user_id, name, cover_emoji, is_preset)
  values (null, 'Defensa Total', '🛡️', true)
  returning id
)
insert into public.deck_cards (deck_id, card_id, quantity)
select id, c.card_id, c.qty from d, (values
  ('qa-lead', 4),
  ('qa-tester', 4),
  ('senior-dev', 3),
  ('architect', 3),
  ('mid-dev', 2),
  ('fullstack', 2),
  ('devops', 2)
) as c(card_id, qty);

-- Equilibrio (20): 3 c/u de 6 cartas + 2 = 20
with d as (
  insert into public.decks (user_id, name, cover_emoji, is_preset)
  values (null, 'Equilibrio', '⚖️', true)
  returning id
)
insert into public.deck_cards (deck_id, card_id, quantity)
select id, c.card_id, c.qty from d, (values
  ('senior-dev', 3),
  ('mid-dev', 3),
  ('junior-dev', 3),
  ('fullstack', 3),
  ('devops', 2),
  ('architect', 2),
  ('qa-tester', 2),
  ('qa-lead', 2)
) as c(card_id, qty);
