# Marquee Night

A TV-studio trivia board for game nights. The big screen shows a 6 × 5 board; the host runs everything from their phone, which also shows the answers. Teams pick tiles, steal on wrong answers, hit hidden bonus tiles, and finish with a wagered final round. Players scan a QR code and type their name (no accounts), get shuffled onto teams, and climb a season leaderboard that ranks people, not teams.

Product brief and design spec: [Trivia Night Webapp — Product Brief.md](./Trivia%20Night%20Webapp%20%E2%80%94%20Product%20Brief.md) · [Marquee Night - Design Spec.md](./Marquee%20Night%20-%20Design%20Spec.md)

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

| Route | What it is |
| --- | --- |
| `/` | Setup on the laptop: pick a saved game, the sample, or a JSON file; enter teams |
| `/tv` | The big screen (1920×1080, scaled to fit). Move the mouse for laptop controls |
| `/host` | The host's phone remote (type the room code from the TV) |
| `/play` | A player's phone: scan the QR code, type a name, follow your team |
| `/leaderboard` | Season power rankings |
| `/editor` | Write games; saved in this browser, exported as JSON |

### Realtime (phone ↔ TV)

Create `.env.local` with your Supabase project's API settings:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Only Realtime **broadcast** is used (no tables), so the free tier is plenty. Make sure public Realtime channels are allowed in the project settings. Without the keys the app falls back to linking tabs in the same browser, which is handy for development but can't reach a phone.

### Players and the season leaderboard

Players scan the QR code in the lobby and type a name; they're dealt onto the smallest team. The host can tap **Shuffle teams**, tap a name to move that player, or ✕ to remove them. Names are unique within a game, and a phone that refreshes rejoins as the same player.

The season leaderboard is optional. To turn it on:

1. Run [`supabase/migrations/20261008000000_season_leaderboard.sql`](./supabase/migrations/20261008000000_season_leaderboard.sql) in the Supabase SQL editor.
2. Add the Supabase **service role** key to `.env.local` (server-only; never `NEXT_PUBLIC_`):
   ```
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

The setup screen then shows **Counts on the season leaderboard** (on by default). When the winner screen shows, the TV saves the results. A person is their name: the same name (ignoring case and spacing) on another night adds to the same row. Opening a night hands the TV a secret token, and only that token can post the night's results.

The tables have row-level security on with no policies, so the public anon key used for Realtime can't read or write them; all access goes through the API routes. There are no accounts, so anyone who can reach the site could open a night and post made-up results with its token. That's fine among friends; put the site behind a password if that ever matters.

The QR code points at whatever address the TV page was opened with, so for a real phone during development open the laptop by its LAN IP (or use the deployed URL).

### Laptop shortcuts on `/tv`

`C` correct · `W` wrong · `R` reveal · `Enter` continue · `P` pause/start timer · `S` skip timer · `Z` undo · `M` mute · `F` fullscreen · `H` pin the controls

## Rules (as implemented)

- Correct: picker gains the tile value. Wrong: picker loses it (scores can go negative), and the next team gets one **risk-free** steal. The turn always passes to the next team in order.
- Bonus tiles (up to 2): the picker wagers 0 to their score, or up to 500 if their score is lower. No steal.
- Final round: teams with a positive score wager secretly on the host's phone; answers are revealed lowest score first.
- The host can edit any score and undo the last action at any time. Undo never removes a player who joined.
- **Streaks:** 3 correct answers in a row puts a 🔥 on the team; every 5 in a row pays a +100 bonus. A wrong answer (including a missed steal) resets it. Score edits don't touch it.
- **Deep cuts:** the last row of every category looks and sounds different (dark red tiles, a drone sting). Write those to be genuinely hard.
- **Season points**, per player: the team's placement points (1st 12 · 2nd 9 · 3rd 7 · 4th 5 · 5th 4 · 6th 3, ties share the better place) plus 1 per correct answer the team made, final included.

### Question types

Set per tile in the editor (`type` in the JSON; omit it for Normal). Types are hidden until the tile is picked.

| Type | JSON | Rules |
| --- | --- | --- |
| Normal | — | Answer the question |
| Multiple choice | `"multipleChoice"`, `options`: 2–6 choices, `answer`: one of them | Stealable |
| True / False | `"trueFalse"`, `answer`: `"True"` or `"False"` | No steal |
| Picture / Audio / Video | `"picture"` / `"audio"` / `"video"`, plus matching `media` | Normal rules |
| Closest wins | `"closest"`, `target`: a number (`answer` optional) | Every team guesses; the closest (ties too) score the value; nobody loses points. Can't be a bonus tile |
| Order it | `"order"`, `options`: 4 items in the correct order | The TV shuffles them and labels A–D; `question` and `answer` are optional |
| Connection | `"connection"`, `options`: 4 clues, `answer` | `question` is optional |
| Wager | `"wager"` | The picker risks 0 to their score (or 500) before seeing the question. No steal. Can't also be a bonus tile |

The answer is never rendered on the TV until it's revealed: the display only ever receives a `PublicView`, which has no answer field until then.

## Game files

A game is one JSON file (format in the product brief). See [`public/sample-game.json`](./public/sample-game.json). Images, audio and video are embedded as `data:` URIs so a game works offline; the editor compresses images to about 500 KB and caps audio at 1.5 MB and video at 4 MB (link bigger clips by URL).

## Development

```bash
npm test           # engine, validation and sound-trigger tests (Vitest)
npm run lint
npm run typecheck
npm run build
```

Code map:

- `src/lib/game/` — the rules engine (pure reducer), TV/host/player view projections, JSON validation, question types, ranking points
- `src/lib/realtime/` — the room channel (Supabase broadcast, BroadcastChannel fallback)
- `src/components/tv/`, `src/components/host/`, `src/components/play/`, `src/components/editor/` — the surfaces
- `src/app/api/nights/` — season nights: open one (returns the TV's secret token), post its results
- `src/lib/server/` — server-only Supabase access for the leaderboard
- `src/lib/sound.ts` — stings synthesized with Web Audio (no audio files)

## Deploying

Import the repo in Vercel, add the two `NEXT_PUBLIC_SUPABASE_*` variables (and `SUPABASE_SERVICE_ROLE_KEY` for the leaderboard) in the project's environment settings, and add your domain under Settings → Domains.
