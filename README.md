# Turkish Tutor

A web app where a 3D character ("Deniz") teaches you Turkish through real conversation, level by level (CEFR A1 → C2).

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind + `@react-three/fiber` (Three.js) for the 3D avatar.
- **Avatar:** `AvatarSample_C`, an official VRoid Studio sample character (`frontend/public/avatar-vroid.glb`), downloaded from [VRoid Hub](https://hub.vroid.com/) (published by the "VRoid Project" account). License (embedded in the file and on the Hub listing): redistribution allowed, corporate/individual commercial use allowed, alterations allowed, no attribution required. Runs in the user's browser, no per-minute cost. Lipsync drives VRoid's native `Fcl_MTH_A` (mouth-open) and `Fcl_EYE_Close` (blink) blendshapes, since this stock export doesn't include the ARKit-named ones — `Avatar.tsx` falls back to these automatically when the ARKit names aren't present. Ready Player Me was the original plan but Netflix acquired RPM and shut it down on Jan 31, 2026; Avaturn (photorealistic, selfie-based) was tried next but its export had a permanent mouth-geometry artifact baked in from the source photo that no blendshape combination could fix; a third-party-modified VRoid model was tried after that but turned out to be licensed "redistribution prohibited" and was removed before ever being committed — this VRoid Hub sample is the one that's actually safe to ship. The old Avaturn files (`avatar.glb`, `avatar.bodyonly.glb`) are still in `frontend/public/` if you want to switch back.
- **Backend:** Python FastAPI.
- **LLM:** Anthropic Claude (tutor brain).
- **TTS:** ElevenLabs (Turkish voice).
- **STT:** OpenAI Whisper (hold-to-talk mic input).

## Repo layout

```
.
├── frontend/        Next.js app — UI, 3D avatar, mic, chat
└── backend/         FastAPI app — Claude, ElevenLabs, curriculum
```

## Prerequisites

- Node.js 20+
- Python 3.11+
- An Anthropic API key — https://console.anthropic.com
- An ElevenLabs API key — https://elevenlabs.io
- An OpenAI API key (for mic input) — https://platform.openai.com/api-keys
- An avatar `.glb` — `frontend/public/avatar-vroid.glb` is already included (VRoid Hub's `AvatarSample_C`, redistribution-licensed). To use a different one, drop a `.glb`/`.vrm` with compatible blendshape names into `frontend/public/` and point `NEXT_PUBLIC_AVATAR_URL` at it — verify its license permits redistribution first.

## First-time setup

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env and fill in ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, OPENAI_API_KEY
uvicorn app.main:app --reload --port 8000
```

Verify: open http://localhost:8000/docs — you should see the FastAPI Swagger UI.

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# The avatar GLB is already in frontend/public/avatar-vroid.glb
# (.env.local already points NEXT_PUBLIC_AVATAR_URL=/avatar-vroid.glb)
npm run dev
```

Open http://localhost:3000 — you should see Deniz the avatar and a chat panel.

## What works in this MVP scaffold

- 3D cartoon avatar renders in the browser (VRoid-based blendshapes for lipsync/blink).
- Type a message → Claude responds in character as a Turkish tutor for the selected lesson.
- Tutor's reply is spoken via ElevenLabs and the avatar's mouth moves with the audio (amplitude-driven lipsync).
- **6 A1 lessons**, selectable from a dropdown, loaded from `backend/app/curriculum/*.json`:
  1. Greetings and introducing yourself
  2. Numbers and age
  3. Family
  4. Daily routine and time
  5. Food and drink
  6. Shopping and colors

  The sequence follows the standard beginner-Turkish topic progression used by established CEFR-aligned courses (e.g. Yunus Emre Enstitüsü's *Yedi İklim Türkçe*, Ankara TÖMER's *Yeni Hitit*) — content and dialogue are original, written to fit Deniz's persona and teaching rules in `backend/app/prompts/tutor_persona.md`.
- `GET /api/lessons` lists all available lessons; `GET /api/lessons/{id}` fetches one lesson's full content.
- **Mic input**: hold the 🎤 button to record, release to transcribe (OpenAI Whisper via `POST /api/transcribe`) and auto-send as your reply. Needs `OPENAI_API_KEY` and browser mic permission.

## What's stubbed / TODO (Phase 2+)

- [ ] Proper viseme-based lipsync (swap ElevenLabs for a TTS that emits visemes for phoneme-accurate mouth shapes).
- [ ] A2–C2 lessons (only A1 exists so far).
- [ ] Progress tracking + SRS flashcards (needs a Postgres DB — Supabase suggested).
- [ ] Pronunciation scoring (Azure Speech Pronunciation Assessment).
- [ ] Auth (Clerk or Supabase Auth).
- [ ] Streaming responses from Claude → ElevenLabs → browser (for lower latency).

## API keys & cost expectations (rough)

| Service | Cost per 15-min lesson (estimate) |
|---|---|
| Claude (with prompt caching) | ~$0.02 |
| ElevenLabs TTS | ~$0.05–0.10 |
| Whisper STT (mic input) | ~$0.05 |
| Avatar + Three.js | $0 |
| **Total per lesson** | **~$0.10–0.20** |
