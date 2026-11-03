# Turkish Tutor — Project Summary

## What it is

**Turkish Tutor** is a web app that teaches Turkish through live conversation with a
3D animated character named **Deniz**, a warm İstanbul-based tutor. Instead of
flashcards or grammar drills, the learner talks (currently by typing) to Deniz,
who replies in character, speaks the reply aloud, and moves the avatar's mouth in
time with the audio. The product is scoped to walk a learner from **CEFR A1 → C2**,
though the current build ships only the first A1 lesson as an MVP scaffold.

The core experience today: the learner clicks **"Start lesson with Deniz"**, Deniz
opens A1 Lesson 1 (greetings), and the two exchange messages. Each of Deniz's
replies comes back as text plus spoken audio, and the avatar's jaw animates to the
loudness of that audio while it plays.

---

## Architecture at a glance

The repository splits cleanly into two apps that talk over HTTP:

- **`frontend/`** — a Next.js 14 (App Router) + TypeScript app that renders the 3D
  avatar, the chat UI, and drives audio playback + lipsync in the browser.
- **`backend/`** — a Python **FastAPI** service that holds the tutor's "brain"
  (Claude), text-to-speech (ElevenLabs), and the curriculum files.

```
.
├── frontend/   Next.js app — UI, 3D avatar, chat, audio/lipsync
└── backend/    FastAPI app — Claude, ElevenLabs, curriculum JSON
```

The single request that ties them together is **`POST /api/chat`**: the frontend
sends the conversation history and a lesson id, and the backend returns Deniz's
text reply plus base64-encoded MP3 audio of that reply.

---

## The stack and the key third-party choices

| Layer | Choice | Notes |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) + TypeScript + Tailwind | Client-rendered single page. |
| 3D rendering | `@react-three/fiber` + `@react-three/drei` (Three.js) | Renders a `.glb` avatar in-browser. |
| Avatar | **Avaturn** | Free for non-commercial, runs client-side, exports `.glb` with ARKit blendshapes + visemes. |
| Tutor brain (LLM) | **Anthropic Claude** (`claude-sonnet-4-5` by default) | Persona + lesson supplied as cached system prompt. |
| Text-to-speech | **ElevenLabs** (`eleven_multilingual_v2`) | Returns MP3; a warm Turkish-capable voice. |
| Speech-to-text | OpenAI Whisper | **Planned for Phase 2** — not yet wired up. |
| Backend | Python FastAPI + Uvicorn | Async throughout. |

A notable design note recorded in the README: the avatar was originally going to
use **Ready Player Me**, but Netflix acquired RPM and shut down its public service
on **Jan 31, 2026**, so the project switched to **Avaturn** as the closest drop-in
replacement (same `.glb` + ARKit-blendshape approach).

---

## How the backend works

**Entry point (`app/main.py`).** A FastAPI app with permissive CORS locked to the
frontend origin, a `/health` check, and the chat router mounted under `/api`.

**Config (`app/config.py`).** Reads `.env` at startup and centralises the Anthropic
and ElevenLabs keys, the Claude model, the ElevenLabs voice/model, and the frontend
origin. It prints a warning (rather than crashing) if either API key is missing, so
the app still boots for partial testing.

**Chat route (`app/routes/chat.py`).** The heart of the API. `POST /api/chat`
accepts a validated Pydantic body of `messages` (each `user`/`assistant` + content)
and a `lesson_id` (default `a1-lesson-01`). It:

1. Loads the lesson JSON from `app/curriculum/` (404s if missing).
2. Calls the LLM service to generate Deniz's reply.
3. Calls the TTS service to synthesize the reply to MP3, base64-encodes it, and —
   importantly — treats **audio as non-fatal**: if TTS throws, it logs and still
   returns the text so the UI keeps working.

There's also a `GET /api/lessons/{lesson_id}` helper that returns raw lesson JSON.

**LLM service (`app/services/llm.py`).** Wraps the async Anthropic client. It builds
**two cacheable system blocks** — the stable persona and the per-lesson brief — and
applies `cache_control: ephemeral` prompt caching so repeated turns in a lesson are
cheap. If the conversation history is empty, it seeds a synthetic `"(start the
lesson)"` user turn so Deniz opens with the lesson's scripted opening line. Replies
are capped at 400 tokens. If no Anthropic key is set, it returns a clear
placeholder string instead of erroring.

**TTS service (`app/services/tts.py`).** Wraps the async ElevenLabs client, streams
the audio chunks from `text_to_speech.convert`, and returns joined MP3 bytes
(`mp3_44100_128`). Raises if the key is unset (which the chat route catches).

**The tutor persona (`app/prompts/tutor_persona.md`).** A carefully written system
prompt that defines *Deniz* — 32, an Istanbullu who loves çay, cats, and the
Bosphorus — and lays down concrete teaching rules: stay within the learner's level,
stay on the lesson, obey an **English budget** that tightens as levels rise (under
~30% English at A1, ~15% at A2, 0% at B1+), gloss each new Turkish word in
parentheses on first use, correct gently by restating rather than saying "wrong",
praise specifically, and keep the learner talking by ending most turns with a small
question. Output is constrained to plain spoken prose (no markdown/bullets) because
it will be read aloud by TTS.

**The curriculum (`app/curriculum/a1_lesson_01.json`).** A single structured lesson
— "Greetings and introducing yourself" — with an id, level, title, learning
objectives, a key-vocabulary list (Turkish↔English pairs like *Merhaba*, *Nasılsın?*,
*Ben ___*), and a scripted bilingual **opening line** that Deniz uses to start the
conversation.

---

## How the frontend works

**Page + layout (`src/app/`).** A single client page splits the screen into the 3D
scene on the left and the chat panel on the right (`grid ... md:grid-cols-[1fr_420px]`),
with a small "Deniz · Turkish tutor · A1 · Lesson 1" name badge overlaid on the scene.

**3D scene (`components/TutorScene.tsx`).** Sets up the `@react-three/fiber` `Canvas`
with a deliberately tight **head-and-shoulders portrait** camera and locked-down
`OrbitControls` (no zoom, no pan, only a sliver of head rotation). This framing is a
key trick: it **crops out the avatar's un-posed T-pose arms**. A radial vignette
overlay further fades the canvas edges into the background so any stray arm blends
into darkness. If no avatar URL is configured, it renders a red placeholder cube and
a hint to set `NEXT_PUBLIC_AVATAR_URL`.

**The avatar (`components/Avatar.tsx`).** The most involved piece of the frontend. It
loads the Avaturn `.glb` and brings it to life, working around several quirks of
auto-generated avatars:

- **Lipsync** — reads a shared `lipsync.value` each frame and drives the `jawOpen`
  (or fallback `mouthOpen`) morph target, critically-damped for smoothness and capped
  at ~0.32 so the mouth parts naturally without baring teeth.
- **Morph reset** — Avaturn GLBs sometimes ship with non-zero default expression
  weights (smile, tongueOut, eyeWide) baked in from the source photo; the component
  zeroes **every** morph target on load and logs what it found, so Deniz starts from
  a neutral face.
- **Tongue hiding** — if a protruding tongue is a separate mesh not controlled by any
  resettable blendshape, it's simply hidden.
- **Arm posing** — a robust routine computes each arm bone's actual world-space shaft
  direction and rotates it to point straight down (a naïve `rotation.z` assumption
  swung the arms the wrong way on this rig).
- **Idle life** — subtle breathing (spine oscillation), gentle head drift, and
  natural blinks every ~2–5s so Deniz doesn't look frozen.

**Chat panel (`components/ChatPanel.tsx`).** Manages the message list, the draft
input, and the busy state. A **"Start lesson"** gate exists specifically because
browsers require a user gesture before audio can play. On each send it posts the
running history to the backend, appends Deniz's reply, and — if audio came back —
plays it while driving lipsync: it decodes the base64 MP3, runs it through a Web
Audio `AnalyserNode`, computes RMS loudness per animation frame, and writes that into
`lipsync.value`. The audio path is heavily hardened so autoplay blocks or decode
errors resolve cleanly instead of hanging the busy state. A footer notes the planned
Phase 2 hold-to-talk mic button.

**Glue (`src/lib/`).** `api.ts` is a typed `postChat` fetch wrapper pointing at
`NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`). `lipsync.ts` is a tiny
module-level `{ value: 0 }` store — deliberately not React state — so the audio
player and the avatar's render loop share the mouth value with zero re-render cost.

---

## Data / request flow (one turn)

1. Learner clicks **Start** (or types a reply) in `ChatPanel`.
2. `postChat` sends the full message history + `lesson_id` to `POST /api/chat`.
3. Backend loads the lesson JSON, builds the cached persona + lesson system prompt,
   and calls Claude for Deniz's reply.
4. Backend synthesizes that reply to MP3 via ElevenLabs, base64-encodes it, and
   returns `{ reply, audio_base64, audio_mime }`.
5. Frontend appends the reply text, then plays the audio while an analyser drives
   `lipsync.value`, which the `Avatar` reads each frame to move the jaw.

---

## Setup essentials

- **Prerequisites:** Node 20+, Python 3.11+, an Anthropic API key, an ElevenLabs API
  key, and an Avaturn `.glb` dropped into `frontend/public/avatar.glb`.
- **Backend:** create a venv, `pip install -r requirements.txt`, copy `.env.example`
  → `.env`, fill the keys, run `uvicorn app.main:app --reload --port 8000` (Swagger at
  `/docs`).
- **Frontend:** `npm install`, copy `.env.local.example` → `.env.local` (already
  points `NEXT_PUBLIC_AVATAR_URL=/avatar.glb`), `npm run dev`, open
  `http://localhost:3000`.

Backend dependencies pin `fastapi`, `uvicorn[standard]`, `anthropic`, `elevenlabs`,
`httpx`, `pydantic`, and `python-dotenv`. Frontend pins Next 14.2, React 18.3, Three
0.169, and the react-three packages.

---

## What works today vs. what's stubbed

**Working MVP:** the 3D avatar renders in-browser; typing a message gets an
in-character A1-Lesson-1 reply from Claude; the reply is spoken by ElevenLabs with
amplitude-driven jaw lipsync; and Lesson 1 (greetings) loads from curriculum JSON.

**Planned (Phase 2+), per the README's TODO list:**

- Mic input → **Whisper STT** (voice-in, not just text-in).
- Proper **viseme-based lipsync** (swap ElevenLabs for a TTS that emits visemes,
  e.g. Azure; the Avaturn blendshapes are already present).
- **Multi-lesson curriculum** + a lesson picker (only one lesson exists now).
- **Progress tracking + SRS flashcards** (would need a Postgres DB; Supabase
  suggested).
- **Pronunciation scoring** (Azure Speech Pronunciation Assessment).
- **Auth** (Clerk or Supabase Auth).
- **Streaming** responses Claude → ElevenLabs → browser for lower latency.
- Richer **avatar animation** (idle breathing/head nods exist; more is wanted).

---

## Cost expectations (README estimate)

Roughly **$0.10–0.20 per 15-minute lesson**: ~\$0.02 for Claude (with prompt
caching), ~\$0.05–0.10 for ElevenLabs TTS, ~\$0.05 for Whisper once Phase 2 lands,
and \$0 for the Avaturn/Three.js rendering (non-commercial).

---

## Notable engineering decisions worth remembering

- **Audio never blocks text.** TTS failures are caught server-side and the browser
  audio path is defensively coded, so a broken/absent voice never breaks the tutoring
  loop.
- **Prompt caching by design.** Persona and lesson are separate cached system blocks
  to keep multi-turn lessons cheap.
- **Portrait framing hides the rig.** Rather than fully rigging the avatar, the tight
  camera + vignette crop out un-posed arms — a pragmatic MVP shortcut.
- **Shared mutable lipsync store.** A plain module object (not React state) couples
  the audio analyser and the Three.js render loop without re-renders.
- **Graceful degradation on missing keys.** Both services return clear placeholders/
  warnings instead of crashing when API keys aren't set.
