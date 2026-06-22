# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based, **multiplayer** D&D app where Claude acts as a Dungeon Master, with ElevenLabs text-to-speech, push-to-talk speech recognition, and dice rolling. Players join a shared session via a short code (which also serves as the save/resume point) and see the story, dice, and character sheets update live across devices. The entire game is in **Dutch** — all UI strings, the Claude system prompt, and speech recognition (`nl-NL`) are Dutch. Keep new user-facing text and DM prompts in Dutch.

## Architecture

There is **no build step and no `package.json`**. The frontend is a single file with two runtime dependencies loaded from CDNs (Google Fonts, `@supabase/supabase-js` UMD). The pieces:

- `index.html` — the entire frontend: HTML, CSS, and vanilla JS in one file (~900 lines).
- `api/dm.js` — Vercel Edge Function proxying to the Anthropic Messages API (`claude-sonnet-4-6`). **Streams** SSE straight through to the browser (`stream: true`) for low latency; also supports a non-streaming JSON mode.
- `api/tts.js` — Vercel Edge Function proxying to the ElevenLabs TTS API (`eleven_multilingual_v2`).
- **Supabase** (project `dnd-claude-dm`, ref `qgjzixblvohjggcwdaou`) — Postgres + Realtime backing the multiplayer `sessions` table. Schema lives only as an applied migration (`create_sessions`), not in the repo.

The API functions exist primarily to keep `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` server-side; the browser never sees the keys. Both are `runtime: "edge"` and handle CORS preflight manually. The Supabase URL + **publishable** key are embedded in `index.html` — that is intentional and safe because access is gated by Row Level Security.

### Multiplayer / sessions (Supabase)

- A single `sessions` table is the shared state: `code` (PK, the join/save code), `messages` (Claude history), `characters`, `players` (`[{id,name,charIndex}]`), `story`, `last_story` (most recent chunk, for TTS), `dice`, `loading`. RLS allows `anon` full read/write — the session code is the de-facto secret (acceptable for a casual game; tighten if this ever holds anything sensitive).
- Clients subscribe to `postgres_changes` filtered by `code`; `applyRow()` is the single funnel that merges a DB row into state `S` and triggers TTS for genuinely new `last_story` (guarded by the module-level `_syncedStory` so joins/echoes don't replay audio).
- **Writes go to the DB, not directly to local state**, then the realtime echo updates everyone (including the writer). `runDM()` additionally sets the final story locally before the echo to avoid a flicker, but deliberately leaves `_syncedStory` unchanged so the echo still drives audio playback.
- Each device has a stable `playerId` in `localStorage`; re-entering a known code resumes (re-claims your character) instead of re-picking. `dnd_lastSession` powers the "resume" button.

### Frontend state model (`index.html`)

The UI is a hand-rolled reactive renderer, not a framework:

- A single global state object `S` holds everything (screen, messages, characters, audio flags, dice, etc.).
- `set(partial)` merges into `S` and calls `draw()`.
- `draw()` re-renders the whole `#root` via `innerHTML` based on `S.screen` (`home` → `setup`/`join` → `pick` → `game`, gated first by the audio `unlock` screen). Event handlers are inline `onclick`/`ontouchstart` attributes that call global functions.

Because rendering blows away the DOM each time, all interactive elements are wired through inline attributes referencing globals — there are no retained DOM references or event listeners to manage. (One consequence: `<input>` values are pushed straight to `S` via `oninput` so they survive re-renders.)

### Game loop

1. `createSession()` (host) / `joinSession()` (others) set up the session; any player's `sendAction()` prefixes the spoken text with `[CharName]` and calls `runDM()`.
2. `runDM()` streams the reply via `callDMStream()` (SSE parser), then **writes the result to the Supabase row**; the realtime echo (`applyRow`) is what actually updates every client's view and plays TTS.
3. The DM is instructed (via `SYSTEM_NL` / `DEFAULT_SYSTEM`) to append a ` ```json ` block of all character stats after every reply. `parseChars()` extracts it; `stripJson()` removes it from the displayed narrative. **Note:** the system prompt is defined in both `index.html` (`SYSTEM_NL`) and `api/dm.js` (`DEFAULT_SYSTEM`) — the client sends `SYSTEM_NL`, so update both if changing DM behavior.

### Audio (iOS-critical)

Audio is the most fragile part and is built around iOS Safari restrictions:

- An "unlock" screen (`unlockThenStart()`) must run inside a user tap to grant audio permission before anything plays.
- Playback uses the Web Audio API (`AudioContext` via `getCtx()`), not `<audio>` elements, with `speechSynthesis` as a fallback (`speakFallback`).
- `speak()` is the single entry point: it fetches the full narrative via `fetchTTS()` (split into ≤4500-char chunks by `splitText()`, fetched in parallel) and plays the chunks back-to-back via `playBuffers()`. There is no per-call character cap on playback — earlier truncation bugs (an 800-char slice) were removed, so do not reintroduce length limits here.
- ElevenLabs voices are listed in `DM_VOICES`; `api/tts.js` caps each request at 4500 chars, which is why client chunking stays at/below 4500.

## Commands

There are no lint or test commands — this project has no tooling. Develop by editing files directly.

To run locally you need the Edge Functions, so use the Vercel CLI (a plain static server won't serve `/api/*`):

```bash
vercel dev
```

Set `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` in the environment (or a `.env` Vercel picks up) for the API routes to work.

## Deploy

Deployed on Vercel. `vercel.json` rewrites all routes to `index.html` (SPA), but `/api/*` is served by the Edge Functions before the rewrite. Required env vars: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`.
