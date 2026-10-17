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
read team chats.

## Rule interpretations

Where the GDD was ambiguous these are the choices made (agreed in planning or picked as defaults). All the
numbers can be changed in the lobby.

- **Round**: Heister Phase (60s) → Police Phase (60s) → Information Phase (60s), 15 rounds. A phase ends early
  once everyone in it is done.
- **Police turn**: optionally move (1–2 stations, or Express up to 4 on one line), plus **one** Search or
  Arrest. The team has 3 arrests per round. Officers act at the same time, not in turn order.
- **Staying put**: moving is optional for everyone ("Stay put" / just end your turn).
- **Express**: must stay on a single line and picks up an Artifact only at its final stop. A normal move picks
  up Artifacts at every station it passes.
- **Search**: your station or one stop away (lobby setting). The envelope says whether a Heister is there right
  now, whether one passed through in the last 2 rounds, and any Artifact found or taken there, plus a random
  **field clue** ("a Heister is on the Pink line", "H2 is NOT within 3 stops of Bocaue", "H1 is carrying 2
  Artifacts", and so on).
- **Moving only** gives no envelope (as in the GDD).
- **Crooked Cop**: gets a tip-off with every Heister's exact location as soon as they finish their turn
  (if they moved or acted that turn).
- **Arrest**: targets a station; every Heister there is caught. If it's wrong, that officer skips the next
  Police Phase. At the Exit Station you must be standing on it to arrest.
- **Exit occupancy**: after officers end 2 rounds in a row on Central Terminal, it must be empty at the end of
  the next Police Phase. Anyone still on it is moved off automatically.
- **Accusation**: during the Information Phase any officer can call one vote per round. It passes with a strict
  majority of active officers (the accused votes too). If correct, the Crooked Cop is removed. If wrong, the
  accused can't arrest next round.
- **Artifacts**: 10, placed at random each game, never on the Exit Station. Arrested Heisters drop their
  Artifacts at the station where they were caught.
- **Player counts**: 4–5 players → 1 Heister. 6–7 → 2 (the host can pick 1). 8 → 2. One officer is always the
  Crooked Cop.
- **Station names**: the unlabeled Green-line stop between 5th Ave. and Abad Santos is named *R. Papa*. Duplicate
  names (Ortigas, Carriedo, Tandang Sora) show their line in envelopes and logs.

## Next: Supabase backend

The dev server keeps games in memory (a server restart ends them). The planned production backend on
Supabase:

- `cc_rooms` (full state, service role only), `cc_views` (one row per player, readable only by that player
  through RLS, streamed with Realtime), `cc_messages` (RLS by channel membership).
- An edge function `game` that runs `shared/engine.ts`: load state → apply action → save → write views.
- Anonymous sign-in for players (it must be enabled under Authentication → Providers in the Supabase
  dashboard).
