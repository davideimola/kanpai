-- The Kinds grow to cover what a copy's owner is likely to keep, so that someone running
-- their own copy finds their bottles already named (ADR-0002, ADR-0008). Agreed with the
-- owner on 2026-10-12.
--
-- Two levels and no deeper: a section is the general heading, a Kind the specific one. What
-- is more specific than a Kind — Champagne, Barolo, an Islay malt, a junmai daiginjo — is the
-- Label's appellation, region, grapes or name, which the search and the filters already read.
--
-- What changes:
--   - Sweet and fortified part: a Moscato d'Asti and a Port are not one thing to a beginner.
--     `kind_sweet_fortified` is replaced by `kind_sweet` and `kind_fortified`, its Labels
--     moving to `kind_sweet`, the closer of the two to what its old name put first.
--   - Wine gains Orange, and Vermouth — a wine with no years, which the model allows because
--     whether a Kind has vintages is the Kind's, not the section's.
--   - Spirits gain Vodka, Tequila and mezcal, and Liqueur and amaro.
--   - A third section, for what is brewed or fermented rather than distilled: Sake, Beer,
--     Cider, Mead. Sake is here and not among the spirits because it is not one.
--
-- The ids are written out, as in `0001`, so every copy agrees on them. The sort orders are
-- moved out of the way first because `kinds_sort_order_key` is checked row by row.

update kinds set sort_order = sort_order + 1000;

insert into kinds (id, name, section, has_vintages, sort_order) values
  ('kind_sweet',     'Sweet',     'Wine', true, 2006),
  ('kind_fortified', 'Fortified', 'Wine', true, 2007);

update labels set kind_id = 'kind_sweet' where kind_id = 'kind_sweet_fortified';
delete from kinds where id = 'kind_sweet_fortified';

update kinds set sort_order = case id
  when 'kind_red'          then 1
  when 'kind_white'        then 2
  when 'kind_rose'         then 3
  when 'kind_sparkling'    then 5
  when 'kind_sweet'        then 6
  when 'kind_fortified'    then 7
  when 'kind_whisky'       then 9
  when 'kind_rum'          then 10
  when 'kind_gin'          then 11
  when 'kind_grappa'       then 14
  when 'kind_brandy'       then 15
  when 'kind_other_spirit' then 17
end;

insert into kinds (id, name, section, has_vintages, sort_order) values
  ('kind_orange',          'Orange',             'Wine',                true,   4),
  ('kind_vermouth',        'Vermouth',           'Wine',                false,  8),
  ('kind_vodka',           'Vodka',              'Spirits',             false, 12),
  ('kind_tequila_mezcal',  'Tequila and mezcal', 'Spirits',             false, 13),
  ('kind_liqueur_amaro',   'Liqueur and amaro',  'Spirits',             false, 16),
  ('kind_sake',            'Sake',               'Sake, beer and more', false, 18),
  ('kind_beer',            'Beer',               'Sake, beer and more', false, 19),
  ('kind_cider',           'Cider',              'Sake, beer and more', false, 20),
  ('kind_mead',            'Mead',               'Sake, beer and more', false, 21);
