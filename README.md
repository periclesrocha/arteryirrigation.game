# Artery Irrigation Regions

A matching game for the head and neck. On the left are 17 arteries, each with one empty
row for every region it irrigates. On the right are all 43 regions, shuffled. Pick an
artery, then pick each region it irrigates, until every row of the table is filled.

**Play it:** https://periclesrocha.com/arteryirrigation.game/

It's the sibling of the [arterial tree game](https://periclesrocha.com/arterybloodsupply.game/)
and looks and scores the same way.

## How it plays

- Pick an artery, then tap its regions one after another. The artery stays selected until
  all its rows are filled. You can also pick a region first and then its artery, or (with a
  mouse) drag a region onto an artery.
- A few regions are irrigated by two arteries: **SCM muscle**, **Floor of mouth**,
  **Soft palate** and **Temporalis muscle**. Each appears twice in the list, and either copy
  can go to either artery.
- **Practice** tells you right away whether a match is right. Wrong picks bounce back and
  count as mistakes. Matches in a row build a streak.
- **Test** gives no feedback until you press **Check answers**, then scores you. Wrong rows
  are marked in amber; tap one (or **Try the wrong ones again**) to send it back.
- **Hint** selects an artery and makes one of its regions pulse.
- **Study the table** (on the start screen) and **See the full table** (at the end) show the
  whole table, ready to print.
- On a phone, the regions sit in a strip at the bottom; swipe it sideways to see them all.

Score = completion time + 10 seconds per mistake + 20 seconds per hint; lower is better.
Runs that end with **Show answers** don't count.

## Leaderboard

Scores go to a global leaderboard (one board for Practice, one for Test), ranked by each
nickname's best score. It uses the **same Supabase project as the arterial tree game**, with
its own table, so `config.js` already has the right URL and key. Every run is also kept in
the player's browser, so the game works without it.

### Switching it on (about 2 minutes, once)

1. Open the Supabase project the tree game uses and go to **SQL Editor**.
2. Start a new query, paste everything in [`supabase/leaderboard.sql`](supabase/leaderboard.sql)
   and click **Run**. It creates the `irrigation_scores` table, the `irrigation_leaderboard`
   view and the access rules. It doesn't touch the tree game's scores, and it's safe to run again.

That's it. Scores finished before this step were kept on the device and are sent the next
time the game opens.

The publishable key in `config.js` is meant to be public. The rules only let it read scores
and add new ones: it can't change or delete a score, set the date or the score itself, post a
time under 20 seconds, or post for the same nickname twice within 15 seconds. To remove a
score, delete its row in Supabase's **Table Editor** (`irrigation_scores`).

The tree game's repository has a scheduled workflow that keeps this Supabase project from
pausing, so this repository doesn't need one.

## Editing the content

Everything lives in `data.js`: two groups (branches of the external carotid artery, branches
of the maxillary artery), each with its arteries in order and the regions they irrigate.
Change a name or add a region and the game lays itself out again. No build step.

## Files

- `index.html`, `styles.css`, `app.js`: the game (plain HTML, CSS and JavaScript)
- `data.js`: the arteries and regions
- `config.js`: the leaderboard connection (Supabase URL and publishable key)
- `supabase/leaderboard.sql`: the database setup for the leaderboard
- `fonts/`: Atkinson Hyperlegible and Crimson Pro, self-hosted (SIL Open Font License,
  see `fonts/LICENSE.txt`)

## Publishing (one-time setup)

Settings → Pages → Build and deployment → Source: **Deploy from a branch**, Branch:
**main**, folder **/ (root)**. GitHub republishes the site after every push to `main`.

To run it locally: `python3 -m http.server` in this folder, then open
http://localhost:8000.
