# The Crooked Cop — online

A browser version of *The Crooked Cop* (Out of Track, BSIT 3-8) for 4–8 players with live chat. The map is a
vector redraw of slide 20 of the GameDev deck.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173, create a room and share the 4-letter code (or the invite link). Other devices on
the same Wi-Fi can join at the "Network" address Vite prints (for example `http://192.168.1.5:5173`).

To test alone, fill the room with bots that make random legal moves:

```bash
npm run bots -- ABCD 3
```

Each browser tab is its own player, so you can also open several tabs.

```bash
npm test
```

runs the rules tests plus a fuzz test that plays 60 random full games and checks that Police never receive
hidden information.

## How it is built

| Path | What it is |
| --- | --- |
| `shared/map.ts` | Stations (with slide-20 coordinates), lines and graph helpers |
| `shared/engine.ts` | The full rules engine. Pure and deterministic, so it runs the same anywhere |
| `shared/chat.ts` | Who can read and post in each chat channel |
| `server/dev-server.ts` | Local WebSocket server that holds the real game state in memory |
| `server/bots.ts` | Random-move bots for testing |
| `src/` | React client: lobby, SVG board, action panel, envelopes, chat |

The server is the facilitator. It keeps the full state and sends each player only *their* view, so Heister
positions, Artifact locations and the Crooked Cop's identity never reach a Police player's browser.

Chat channels: **All** (everyone), **Police** (all officers, including the Crooked Cop), **Heisters** (Heisters
only), and **DMs** (the host can turn DMs off). If the host sits out as facilitator, they see everything and can
read team chats. Once the game starts, spectators can read but not post; the facilitator can still post in All.

### Player tokens and artwork

Each seated player gets one colour (in join order, up to 8) that follows them across the board token, player
list, chat and Heister trail. Token shape shows the role: a shield for officers, a diamond with a red frame for
Heisters. Hovering a player in the list spotlights their token on the map.

Everything is drawn in vector art, so no images are required. To swap in final artwork, put the files in
`public/assets` and set their paths in `src/game/art.ts`: one token image per role, optional per-seat
portraits, and phase-banner backgrounds. Any slot left `null` keeps the vector fallback.

## Rule interpretations

Where the GDD was ambiguous these are the choices made (agreed in planning or picked as defaults). All the
numbers can be changed in the lobby.

- **Setup**: everyone picks a starting station and can change it freely until they press **Lock in**. Setup ends
  when everyone has locked in or the timer runs out (anyone without a pick is placed at random). Officers see
  each other's picks; Heisters only see officer starts once setup ends. Heisters can't start on an Exit.
- **Round**: Heister Phase (60s) → Police Phase (45s per officer) → Information Phase (60s), 15 rounds. A phase
  ends early once everyone in it is done.
- **Police turn**: officers go **one at a time** in seat order, each with their own timer. Each officer takes
  **one** action: Move (1–2 stations), Express (up to 5 stops), Search, Arrest or (once unlocked) Ultimate, or passes. The team has
  3 arrests per round.
- **Staying put**: moving is optional for everyone ("Stay put" / just end your turn).
- **Express**: up to 5 stops; it keeps to its line but may change lines at an interchange, and picks up an
  Artifact only at its final stop. A Heister's Express card
  then recharges for one round (they can't Express two rounds in a row); officers have no cooldown. A normal move picks
  up Artifacts at every station it passes.
- **Search**: your station or one stop away (lobby setting), and the officer **goes to** the searched station.
  It sweeps an area: at an interchange, every station one stop away on any line; elsewhere, 2 stops each way along
  the station's line. The swept stations stay highlighted for the searcher that round. The envelope says whether a Heister is there right
  now, whether one passed through in the last 2 rounds, and any Artifact found or taken there, plus a random
  **field clue** ("a Heister is on the Pink line", "H2 is NOT within 3 stops of Bocaue", "H1 is carrying 2
  Artifacts", and so on).
- **Police Ultimate**: unlocks for the rest of the game once the Heisters have taken **3 Artifacts**. Each officer
  (the Crooked Cop included) may play it **once per game** as their action for the round: it scans the whole line
  through their station and their private envelope says whether any Heister is on that line right now (yes or no,
  not where). At an interchange the officer picks which line to scan. Everyone sees that it was played and on which line.
- **Moving only** gives no envelope (as in the GDD).
- **Crooked Cop**: gets a tip-off with every Heister's exact location as soon as they finish their turn
  (if they moved or acted that turn).
- **Arrest**: targets a station; every Heister there is caught. If it's wrong, that officer skips the next
  Police Phase. At an Exit Station you must be standing on it to arrest.
- **Exit Stations**: Central Terminal for 4–6 players; 7–8 players add **Clark Airport** (end of the Red line) as
  a second exit. A Heister escapes by reaching either one carrying at least **half of all the Artifacts**
  (rounded up, so 5 of 10).
- **Exit occupancy**: after officers end 2 rounds in a row on an exit, that exit must be empty at the end of
  the next Police Phase. Anyone still on it is moved off automatically. Each exit is counted separately.
- **AFK**: a player whose timer runs out without acting is marked **AFK** (list, board and status strip). An AFK or
  offline officer's next Police turn is cut to 15 seconds. Taking any action clears it.
- **Accusation**: during the Information Phase any officer can call one vote per round. It passes with a strict
  majority of active officers (the accused votes too). If correct, the Crooked Cop is removed. If wrong, the
  accused can't arrest next round.
- **Artifacts**: 10, placed at random each game, never on an Exit Station. Arrested Heisters drop their
  Artifacts at the station where they were caught.
- **Player counts**: 4–5 players → 1 Heister. 6–7 → 2 (the host can pick 1). 8 → 2. One officer is always the
  Crooked Cop.
- **Station names**: the unlabeled Green-line stop between 5th Ave. and Abad Santos is named *R. Papa*. Duplicate
  names (Ortigas, Carriedo, Tandang Sora) show their line in envelopes and logs.

## Facilitator mode (physical board)

For games played on the printed board with physical cards. Pick **Facilitator mode** on the home screen. Only the
facilitator uses the device; the rules engine runs in the browser, so it needs no server or connection, and the game
is saved in the browser so a reload carries on where it left off.

- **Lobby**: type in each player's name. Roles are either dealt at random on the device or set to match the physical
  role cards.
- **Recording**: a "Recording for" bar shows whose move it is. Tap a station to place a start (setup), move a Heister,
  or search or arrest for the officer whose turn it is. The app checks each move is legal and writes the envelopes
  (searches, tip-offs, field clues) for you to read out or copy onto cards. In the Information Phase you record an
  accusation and each officer's vote.
- **Artifacts** are placed at random. During setup, **Move Artifacts to match the board** lets you tap stations to add
  or remove them; the escape target follows the new total.
- **Timer**: pause, resume, +30s / +1 min, and **Show timer to table**, a full-screen countdown with nothing secret on it.
- **Undo** takes back the last thing recorded. **Add to the log** keeps rulings and notes. **Export record** saves a
  text file with players and roles, the log round by round, and every clue.

The code is `src/net/useTableGame.ts` (local game and save), `src/screens/TableLobby.tsx` and
`src/screens/TableScreen.tsx`.

## Online play (Supabase)

The online backend runs on the Supabase project **crooked-cop** (`hxoubdwmvrecptxzrzzp`). It is already deployed.

- `cc_rooms` holds the full game state and `cc_messages` holds chat. Both have RLS enabled with no policies, so
  only the service role can touch them. Browsers can't read either table.
- The `game` edge function (`supabase/functions/game/index.ts`) runs the same `shared/engine.ts`: load room →
  apply action → save (with optimistic locking on `version`) → broadcast each player their own view.
- Each player gets a secret token. Their view and chat arrive on a Realtime broadcast topic named after that
  token, so nobody else can listen in. Players don't need an account.
- Phase timers advance when a client notices a deadline has passed and calls `tick`. The engine ignores
  repeats.

```bash
npm run dev:online
```

starts the client against Supabase.

```bash
npm run build
```

produces a static site in `dist/` that plays online with no extra settings (the Supabase URL and publishable key are
built in, see `src/net/config.ts`). Host it anywhere: Vercel, Netlify, GitHub Pages.

```bash
npm run bots:online -- ABCD 3
```

sends bots into an online room.

After changing anything in `shared/`, redeploy the function. This copies the engine into the function folder
first:

```bash
npm run deploy:fn
```

Not done yet: old rooms are never deleted (a scheduled cleanup of rooms idle for over a day would fix it), and
online lobbies don't detect closed tabs (the host can remove ghosts).
