# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based D&D app where Claude acts as a Dungeon Master, with ElevenLabs text-to-speech, push-to-talk speech recognition, and dice rolling. The entire game is in **Dutch** — all UI strings, the Claude system prompt, and speech recognition (`nl-NL`) are Dutch. Keep new user-facing text and DM prompts in Dutch.

## Architecture

There is **no build step, no framework, and no dependencies** (no `package.json`). The whole thing is three files:

- `index.html` — the entire frontend: HTML, CSS, and vanilla JS in one file (~700 lines).
- `api/dm.js` — Vercel Edge Function proxying to the Anthropic Messages API (`claude-sonnet-4-6`).
- `api/tts.js` — Vercel Edge Function proxying to the ElevenLabs TTS API (`eleven_multilingual_v2`).

The API functions exist primarily to keep `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` server-side; the browser never sees the keys. Both are `runtime: "edge"` and handle CORS preflight manually.

### Frontend state model (`index.html`)

The UI is a hand-rolled reactive renderer, not a framework:

- A single global state object `S` holds everything (screen, messages, characters, audio flags, dice, etc.).
- `set(partial)` merges into `S` and calls `draw()`.
- `draw()` re-renders the whole `#root` via `innerHTML` based on `S.screen` (`unlock` → `setup` → `game`). Event handlers are inline `onclick`/`ontouchstart` attributes that call global functions.

Because rendering blows away the DOM each time, all interactive elements are wired through inline attributes referencing globals — there are no retained DOM references or event listeners to manage.

### Game loop

1. `startGame()` / `sendAction()` build the message array and POST to `/api/dm`.
2. The DM is instructed (via `SYSTEM_NL` / `DEFAULT_SYSTEM`) to append a ` ```json ` block of all character stats after every reply. `parseChars()` extracts it; `stripJson()` removes it from the displayed narrative.
3. The cleaned narrative is sent to `/api/tts` and played back. **Note:** the system prompt is defined in both `index.html` (`SYSTEM_NL`) and `api/dm.js` (`DEFAULT_SYSTEM`) — the client sends `SYSTEM_NL`, so update both if changing DM behavior.

### Audio (iOS-critical)

Audio is the most fragile part and is built around iOS Safari restrictions:

- An "unlock" screen (`unlockThenStart()`) must run inside a user tap to grant audio permission before anything plays.
- Playback uses the Web Audio API (`AudioContext` via `getCtx()`), not `<audio>` elements, with `speechSynthesis` as a fallback (`speakFallback`).
- TTS is fetched as `ArrayBuffer`(s) in parallel with the DM text response and stashed in `S.pendingBuf`; long text is split into ≤4500-char chunks (`splitText`) and queued back-to-back.
- ElevenLabs voices are listed in `DM_VOICES`; the API caps text at 4500 chars per request.

## Commands

There are no lint or test commands — this project has no tooling. Develop by editing files directly.

To run locally you need the Edge Functions, so use the Vercel CLI (a plain static server won't serve `/api/*`):

```bash
vercel dev
```

Set `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` in the environment (or a `.env` Vercel picks up) for the API routes to work.

## Deploy

Deployed on Vercel. `vercel.json` rewrites all routes to `index.html` (SPA), but `/api/*` is served by the Edge Functions before the rewrite. Required env vars: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`.
