-- =============================================================================
-- Recruiting Tracker — starter seed (OPTIONAL)
-- =============================================================================
-- Pre-loads the facilities, regions, divisions and census pulled from the
-- team's existing spreadsheets, so the app isn't empty on first use. Run AFTER
-- schema.sql, in Supabase -> SQL Editor. Census values are a point-in-time
-- snapshot — update them in the app. Portfolio is left blank where it wasn't
-- unambiguous in the source; fill it in from the Facilities screen.
--
-- Guarded so it only seeds when the facilities table is empty (safe to run once).
-- =============================================================================
do $$
begin
if (select count(*) from public.facilities) = 0 then

  insert into public.facilities (name, division, region, census) values
  -- ---- Missouri / Kansas ----
  ('Bridgewood Health Care Center',            'Missouri / Kansas', 'Kansas City MO', 137),
  ('Edgewood Manor Health Care Center',        'Missouri / Kansas', 'Kansas City MO', 47),
  ('Gregory Ridge Health Care Center',         'Missouri / Kansas', 'Kansas City MO', 104),
  ('Nicks Health Care Center',                 'Missouri / Kansas', 'Kansas City MO', 66),
  ('Odessa Health Care Center',                'Missouri / Kansas', 'Kansas City MO', 9),
  ('Parkway Health Care Center',               'Missouri / Kansas', 'Kansas City MO', 58),
  ('Eastview Manor Care Center',               'Missouri / Kansas', 'North Central', 80),
  ('Milan Health Care Center',                 'Missouri / Kansas', 'North Central', 23),
  ('Brookfield Health Care Center',            'Missouri / Kansas', 'North Central', 4),
  ('Brunswick Health Care Center',             'Missouri / Kansas', 'North Central', 7),
  ('Wellsville Health Care Center',            'Missouri / Kansas', 'North Central', 67),
  ('Westview Nursing Home',                    'Missouri / Kansas', 'North Central', 52),
  ('Easton Health Care Center (Kansas)',       'Missouri / Kansas', 'KC Kansas', 2),
  ('Holton Health Care Center (Kansas)',       'Missouri / Kansas', 'KC Kansas', 0),
  ('Nortonville (Kansas)',                     'Missouri / Kansas', 'KC Kansas', 0),
  ('St Elizabeth Health Care Center',          'Missouri / Kansas', 'Middle South MO', 59),
  ('Chariton Park Health Care Center',         'Missouri / Kansas', 'Moberly', 114),
  ('North Village Park',                       'Missouri / Kansas', 'Moberly', 172),
  ('Levering (RCF) Salt River (Shelbina)',     'Missouri / Kansas', 'North Central', 17),
  ('Cedargate Health Care Center',             'Missouri / Kansas', 'SE MO', 11),
  ('Greenville Health Care Center',            'Missouri / Kansas', 'SE MO', 14),
  ('Portageville Healthcare Center',           'Missouri / Kansas', 'SE MO', 57),
  ('Stonecrest Healthcare',                    'Missouri / Kansas', 'SE MO', 56),
  ('Fair View Health Care Center',             'Missouri / Kansas', 'Sedalia', 63),
  ('Four Seasons Living Center',               'Missouri / Kansas', 'Sedalia', 224),
  ('Legendary Health Care Center',             'Missouri / Kansas', 'Sedalia', 18),
  ('Pettis County Assisted Living',            'Missouri / Kansas', 'Sedalia', 111),
  ('Rest Haven Health Care Center',            'Missouri / Kansas', 'Sedalia', 61),
  ('Bernard Care Center (STL)',                'Missouri / Kansas', 'St Louis', 89),
  ('Carrie Ellingson Geitner Health Care (STL)','Missouri / Kansas', 'St Louis', 31),
  ('Crestwood Health Care Center (STL)',       'Missouri / Kansas', 'St Louis', 88),
  ('Grand Manor Health Care Center (STL)',     'Missouri / Kansas', 'St Louis', 52),
  ('Heritage Care Center of Berkeley (STL)',   'Missouri / Kansas', 'St Louis', 67),
  ('Hidden Lake Health Care Center (STL)',     'Missouri / Kansas', 'St Louis', 6),
  ('Hillside Health Care Center (STL)',        'Missouri / Kansas', 'St Louis', 0),
  ('South County Health Care Center (STL)',    'Missouri / Kansas', 'St Louis', 25),
  ('Cassville Health Care Center',             'Missouri / Kansas', 'West Rural MO', 0),
  ('Nathan Richard Health Care Center',        'Missouri / Kansas', 'West Rural MO', 59),
  ('Sarcoxie Health Care Center',              'Missouri / Kansas', 'West Rural MO', 35),
  -- ---- Ohio ----
  ('Parkside',           'Ohio', 'Southern', 72),
  ('Carlisle Manor',     'Ohio', 'Southern', 44),
  ('Lebanon',            'Ohio', 'Southern', 59),
  ('Springfield',        'Ohio', 'Southern', 50),
  ('Woodview',           'Ohio', 'Columbus', 63),
  ('Winchester',         'Ohio', 'Columbus', 88),
  ('Pickerington',       'Ohio', 'Columbus', 68),
  ('Forest Hills',       'Ohio', 'Columbus', 66),
  ('Cambridge',          'Ohio', 'West Columbus', 72),
  ('Grande Oaks',        'Ohio', 'East Cleveland', 36),
  ('Grande Pavilion',    'Ohio', 'East Cleveland', 35),
  ('Madison Healthcare', 'Ohio', 'East Cleveland', 101),
  ('Valley View',        'Ohio', 'Central Southern', 44),
  ('Logan',              'Ohio', 'Central Southern', 95),
  ('Longmeadow',         'Ohio', 'NE Ohio', 54),
  ('Autumnwood',         'Ohio', 'NE Ohio', 56),
  ('Shady Lawn',         'Ohio', 'NE Ohio', 73),
  ('Shady Lawn ALF',     'Ohio', 'NE Ohio', 52),
  ('Oak Hills',          'Ohio', 'West Cleveland', 62),
  ('Rockport',           'Ohio', 'Northern Cleveland', 98),
  ('Richmond Hts SNF and AL', 'Ohio', 'Northern Cleveland', 70),
  ('Royal Oak',          'Ohio', 'Northern Cleveland', 63),
  ('Seasons (behaviors)','Ohio', 'Cleveland', 46),
  ('Stow (AL)',          'Ohio', 'Cleveland', 64),
  ('Willard ALF',        'Ohio', 'Central', 2),
  ('Willard SNF',        'Ohio', 'Central', 55),
  ('Crystal Care',       'Ohio', 'Central', 62),
  ('Willard Detox Center','Ohio', 'Central', null),
  ('Swanton',            'Ohio', 'Toledo', 59),
  ('Fostoria',           'Ohio', 'Toledo', 40),
  ('Fostoria AL',        'Ohio', 'Toledo', null);

end if;
end $$;

-- =============================================================================
-- Done. Open the Facilities screen to set Have/Need coverage per role, then
-- assign recruiters to regions on the Team screen.
-- =============================================================================
