-- The Kinds, which are rows and not an enum (ADR-0002).
--
-- `0000` created the table; this fills it, and it is a file of its own for the same reason
-- the Kinds are data: the vocabulary grows, and each growth — a beer, a sake, a vermouth —
-- is its own file after this one, never an edit to this one.
--
-- Hand-written, and it will stay hand-written. `drizzle-kit generate` diffs a schema and
-- emits DDL; rows are not schema and it will never write them. This file was made empty by
-- `drizzle-kit generate --custom` so that the journal still owns its place in the order.
--
-- The names are `CONTEXT.md`'s, in its order. The ids are written out rather than left to
-- `gen_prefixed_id()` so that every copy of kanpai agrees on them: a Kind named in a fixture,
-- a prompt or an import means the same row everywhere.

insert into kinds (id, name, section, has_vintages, sort_order) values
  ('kind_red',             'Red',             'Wine',    true,   1),
  ('kind_white',           'White',           'Wine',    true,   2),
  ('kind_rose',            'Rosé',            'Wine',    true,   3),
  ('kind_sparkling',       'Sparkling',       'Wine',    true,   4),
  ('kind_sweet_fortified', 'Sweet/fortified', 'Wine',    true,   5),
  ('kind_whisky',          'Whisky',          'Spirits', false,  6),
  ('kind_rum',             'Rum',             'Spirits', false,  7),
  ('kind_gin',             'Gin',             'Spirits', false,  8),
  ('kind_grappa',          'Grappa',          'Spirits', false,  9),
  ('kind_brandy',          'Brandy',          'Spirits', false, 10),
  -- The catch-all, last. A spirit that fits none of the five above is still a spirit, so it
  -- is recorded under this rather than refused; when several Labels gather here, the
  -- answer is a new row for what they share, not a wider meaning for this one.
  ('kind_other_spirit',    'Other spirit',    'Spirits', false, 11);
