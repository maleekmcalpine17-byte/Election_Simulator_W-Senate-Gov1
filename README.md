# Election Game 2024

## Run the web UI (VS Code Live Server)
1. Open this folder in VS Code.
2. Install the "Live Server" extension.
3. Right-click `index.html` -> "Open with Live Server".

## Run the Streamlit version
    pip install -r requirements.txt
    streamlit run election_game.py

## Election presets (web UI)
The "Election" dropdown at the top loads a real presidential election (or "Current day"). A preset sets each
state's real electoral votes and lean, the national environment, and the nominees' names. Candidates start at a
typical profile with equal approval and no home state, so running a preset as-is reproduces that election's real
winner and margin in every state, and the real electoral vote total. Then move any slider to ask "what if".

**Elections included (33):** 1864, 1868, 1876, 1880, 1884, 1888, 1900, 1904, 1908, 1916, 1920, 1928, 1932,
1936, 1940, 1944, 1952, 1956, 1964, 1972, and every election from 1976 to 2024.

**Left out on purpose:** 1856, 1860, 1892, 1912, 1924, 1948 and 1968 (third-party candidates won states, which a
two-candidate game can't represent), 1872 (Greeley died and his electors scattered), 1896 (the data's Democratic
national total is 2.1% below the official one), and 1960 (unpledged electors). Elections before 1856 have no
Republican Party, so they aren't included either.

How the special cases work:
- States that didn't exist yet, DC before 1964, and the Confederacy in 1864 and 1868 are simply left out.
- Florida in 1868 and Colorado in 1876 had no popular vote (the legislature chose the electors), so their
  electoral votes are fixed to the real winner and they can't be edited.
- Where real electors were split (Maryland 1904 and 1908, West Virginia 1916, California 1880), the real split is
  kept until you flip that state, after which it is winner-take-all.
- 1956 Alabama and 1972 Virginia each had one faithless elector, counted for the candidate they were pledged to.
- From 1976 on, Maine and Nebraska aren't split (winner-take-all by state).
- Margins are Republican % minus Democratic % of the votes counted. Elections with strong third-party showings
  (1980, 1992, 1996, 1904, 1908, 1920) say so in the preset note.
- State issue stances are the same current estimates in every preset (there is no historical data for them), and the
  real candidates' stances are already baked into each state's real result. Presets are a faithful starting point for
  what-ifs, not predictions.

**Data and accuracy**
- 1976-2024: MIT Election Data and Science Lab, U.S. President 1976-2024. Its South Carolina 1992 row lists Clinton at
  525,514 votes; the real figure is 479,514, so that one state uses the other file's numbers (R+8.1, not R+4.2).
- Before 1976: elec.csv from github.com/zonination/election-history (American Presidency Project and National
  Archives data). Checked two ways: electoral votes match the historical record exactly in every included election,
  and national popular vote totals are within about 0.5% of the official figures. For 1976-2016, where both files
  overlap, the state margins differ by 0.03 points on average and up to about 1 point in a few small states, because
  MIT counts write-ins in the total and elec.csv mostly doesn't. Treat pre-1976 margins as accurate to roughly a point.
- To rebuild `elections.js`:
  `python tools/build_elections.py path/to/1976-2024-president.csv path/to/elec.csv`
  It refuses to write the file if any check fails.
- The Streamlit version does not have presets or the Senate and governor tabs yet; it only has the "current day" president mode.

## Senate and governor tabs (web UI)
Four extra tabs next to "President": **Senate: single race**, **Senate: all races**, **Governor: single race** and
**Governor: all races**. Each starts with a **class picker**, so every Senate class and every gubernatorial year is
editable, not just 2026. Each class keeps its own edits while you switch between classes and tabs.

| Office | Classes |
|---|---|
| Senate | 2026 (Class 2, 35 seats: 33 regular plus the Florida and Ohio specials), 2028 (Class 3, 34 seats), 2030 (Class 1, 33 seats) |
| Governor | 2026 (36), 2027 (off-year: KY, LA, MS), 2028 (11: nine four-year races plus NH and VT), 2029 (off-year: NJ, VA), 2030 (the same 36 states as 2026, including NH and VT) |

New Hampshire and Vermont have two-year terms, so they appear in the 2026, 2028 and 2030 governor classes. In every
class the seats and governorships that are not up are counted, so the tally always covers all 100 seats or 50 governors.

- **Single race:** pick a race, edit both candidates (name, incumbency, five issue stances, approval), the party
  holding the seat, the state's PVI and the race adjustment, and see the winner, margin, rating and a full breakdown of
  where the margin comes from.
- **All races:** every race in one table with editable candidate names and an editable "held by" party. Press Edit on a
  row for the full candidate editor. Results, the Senate control / governorship tally and the list of flips update as you type.
- **Incumbency:** each candidate has an "Incumbent (+3 points)" checkbox, so you can model an incumbent running, an open
  seat (neither ticked) or a seat where both sides have an incumbent. "Party holding the seat" is separate: it decides
  what counts as a flip and who wins a dead-even race.
- **Incumbent president:** at the top of every class, set the president's party and approval (0-100%, 50 is neutral).
  Every point away from 50 moves every race 0.4 points (Senate) or 0.3 points (governor) toward the president's party
  above 50 and away from it below 50. A 50-50 Senate is decided by the president's party (the Vice President breaks the tie).
  The default is a Republican president at 36% approval (polling averages on October 8, 2026).
- **Model:** margin (R minus D) = national environment shift + 2 x state PVI + 3 per incumbent + incumbent president
  effect + race adjustment + 0.5 x issue fit vs. a typical Republican and Democrat + 0.25 x candidate approval gap.
- **2026 defaults are calibrated to the Cook Political Report rating** of each race, not to polls: a race whose PVI-based
  margin falls outside its rating's band (Solid 12+, Likely 7-12, Lean 3-7) gets a "race adjustment" that moves it to
  the nearest edge of the band, and a Tossup starts half a point toward the party holding the seat. The adjustment also
  cancels the default president's effect, so the 2026 races start exactly at their ratings and moving the president's
  approval shows the change from there. The environment slider starts at 0, which means "where the forecasters have it today".
- **The other classes (2027-2030) are scaffolding.** There are no nominees or Cook ratings yet, so each race starts at
  2 x state PVI + incumbency + the president effect, with a race adjustment of 0 (and the environment slider means "no shift").
  The sitting officeholder is entered as the incumbent in the holding party's slot and the other side is a generic
  nominee. Senators and governors are assumed to run again (Montana's governor is term-limited, and the Kentucky,
  Mississippi and Virginia governors can't run), so untick Incumbent and rename candidates for retirements and open seats.
  The 2030 governor class starts with every race held by today's party and no incumbent, because who holds each office
  in 2030 depends on the 2026 results; set the holder and incumbency in the game. Klobuchar and Blackburn are running
  for governor in 2026, which would open their 2030 Senate seats.
- **Tally:** the Senate has 34 Democratic-caucus and 31 Republican seats not up in 2026 (32 and 34 in 2028, 28 and 39 in
  2030), with 47 Democratic-caucus seats in all (including independents King and Sanders). Democrats need 51 for control;
  at 50-50 the president's party controls through the Vice President. Governors not up in 2026: 6 Democratic, 8 Republican
  (24 Democratic and 26 Republican governors in all, as of October 2026).
- **Independents:** in Idaho, Montana, Nebraska and South Dakota (2026) the main challenger is an independent (the Democratic
  nominee withdrew, or in Montana the independent is the main challenger), so the independent fills the Democratic-side
  slot and is counted with the Democrats. That assumes they would caucus with them, which isn't certain. The same applies to
  Angus King and Bernie Sanders in the 2030 class.
- **Placeholders:** Alaska governor (three Republicans advanced under ranked-choice voting) and Rhode Island governor
  (Republican primary result not in the source) show a placeholder name. Maine's independent governor candidate isn't modeled.
- **Ties** (exactly 0.000) go to the party holding the seat.
- **Updating:** all race data is in `races.js`, grouped by class (nominees, incumbents, ratings, seat holders, and the
  seats not up in each class). Edit it if a nominee is replaced or ratings change; the calibration recomputes automatically.

## How margins work
Margins are in percentage points (R minus D), shown like `R+6.2` / `D+3.1`:

    margin = national environment + national swing from approval
           + 2 x state PVI
           + 0.5 x (how much better Candidate 1 fits the state than Candidate 2,
                    compared with a typical Republican vs. a typical Democrat)

- **PVI**: in "Current day" each state starts at its 2025 Cook PVI (2020 + 2024 elections), source: The Cook Political Report.
  PVI is a lean in two-party vote share, so the lean in margin is double it (Texas R+6 -> about R+12 before
  candidates and approval).
- **Typical profiles**: the candidate sliders now start on a typical Republican / typical Democrat. With both
  at those profiles and equal approval, every state's margin is exactly 2 x its PVI. Moving a slider away from
  typical moves margins; stances far from the center cost votes.
- **Approval**: every point of approval gap (Candidate 1 minus Candidate 2) moves every state by 0.25 points.
- **National environment**: a slider from D+30 to R+30 (half-point steps, default EVEN) that shifts every
  state by the same amount, before candidate and approval effects. For reference, 2024 was about R+1.5 and
  2020 about D+4.5. With the typical candidates, R+1.5 gives 312-226 for the Republican.
- **Home states**: each candidate has an optional "Home state" dropdown (default None). In their home state
  they gain 4 issue-score points, the same bonus as the original console game, which is 2.0 points of margin.
- **Ties**: a margin of exactly 0.0 (EVEN) is decided at random, as before.

## State Settings
Open "State Settings (PVI & stances)", pick a state, and change its PVI or any of its five stances with the
sliders (e.g. Texas immigration 8 -> 4, or Texas PVI R+6 -> R+3). Edits are kept for all states until you press
"Reset this state", "Reset all states", or "Restart Game". Edits are measured against the original state data,
so lowering Texas's immigration stance helps whichever candidate is closer to the new stance.

## Tuning
All constants are at the top of the model section (`election_game.py`) and in `script.js`:
`TYPICAL_R`, `TYPICAL_D`, `HOME_STATE_BONUS`, `POINTS_TO_MARGIN`, `PVI_TO_MARGIN`, `APPROVAL_TO_MARGIN`.
These are rough calibrations, not a fitted forecast model. Keep both files in sync if you change them.
