# Turkish Tutor

A web app where a 3D character, Deniz, teaches you Turkish through real conversation, level by level (CEFR A1 → C2). You speak or type, Deniz answers out loud, and her mouth moves with the audio.

<!-- DEMO: record ~30s of a lesson, save the GIF as docs/demo.gif, then delete this comment and uncomment the line below.
![Deniz teaching an A1 lesson](docs/demo.gif)
-->

## What it does

- **Conversation, not flashcards.** Pick a lesson, then talk to Deniz. Claude plays the tutor, in character, scoped to that lesson's material.
- **Voice in.** Hold the 🎤 button to record, release to transcribe (Whisper) and send automatically.
- **Voice out.** The reply is spoken with ElevenLabs and drives the avatar's mouth through amplitude-based lipsync in the browser.
- **Six A1 lessons**, loaded from `backend/app/curriculum/*.json` and selectable from a dropdown:
  greetings and introductions, numbers and age, family, daily routine and time, food and drink, shopping and colours.

  The sequence follows the standard beginner-Turkish topic progression used by established CEFR-aligned courses (Yunus Emre Enstitüsü's *Yedi İklim Türkçe*, Ankara TÖMER's *Yeni Hitit*). The content and dialogue are original, written to fit Deniz's persona and teaching rules in `backend/app/prompts/tutor_persona.md`.
- **Degrades instead of breaking.** If speech synthesis fails the lesson continues as text, and the app still boots with missing API keys so parts of it can be tested.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind, `@react-three/fiber` (Three.js) |
| Backend | Python, FastAPI |
| Tutor | Anthropic Claude, OpenAI or Gemini, selected with `LLM_PROVIDER` |
| Speech out | ElevenLabs (Turkish voice) |
| Speech in | OpenAI Whisper |
| Avatar | VRoid `AvatarSample_C`, rendered in the browser (see [Avatar](#avatar)) |

```
.
├── frontend/        Next.js app — UI, 3D avatar, mic, chat
└── backend/         FastAPI app — Claude, ElevenLabs, curriculum
```

## Running it

You need Node.js 20+, Python 3.11+, and API keys. The avatar is already in the repo.

You need **one** key for the tutor, chosen with `LLM_PROVIDER`: [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com/api-keys) or [Gemini](https://aistudio.google.com/apikey). Gemini has a free tier and needs no card, so it is the cheapest way to try this. You also need [ElevenLabs](https://elevenlabs.io) for the voice, and an OpenAI key for microphone input regardless of which tutor you pick, since transcription uses Whisper.

**Backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in the three API keys
uvicorn app.main:app --reload --port 8000
```

Check http://localhost:8000/docs for the FastAPI Swagger UI.

**Frontend**

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open http://localhost:3000 and you should see Deniz and a chat panel.

## Swapping the model

The tutor sits behind one function, `generate_tutor_reply()` in `app/services/llm.py`. Nothing else in the app knows which model answered, so switching is one line in `.env`:

```bash
LLM_PROVIDER=gemini      # or anthropic (default), or openai
GEMINI_API_KEY=...
```

Each provider SDK is imported inside its own function, so a provider you are not using does not need to be installed. Prompt caching is applied on the Anthropic path only, because the `cache_control` blocks are specific to that API. Model names move; if a call 404s, set `CLAUDE_MODEL`, `OPENAI_MODEL` or `GEMINI_MODEL` to whatever the provider currently lists.

## API

- `GET /api/lessons` — list all lessons
- `GET /api/lessons/{id}` — one lesson's full content
- `POST /api/chat` — a conversational turn, returns text plus base64 MP3
- `POST /api/transcribe` — audio in, text out

## Avatar

The committed avatar is `AvatarSample_C`, an official VRoid Studio sample from [VRoid Hub](https://hub.vroid.com/), published by the VRoid Project account. Its licence, embedded in the file and shown on the Hub listing, allows redistribution, commercial use by individuals and companies, and alterations, with no attribution required. It renders in the user's browser, so there is no per-minute avatar cost.

Lipsync drives VRoid's native `Fcl_MTH_A` (mouth open) and `Fcl_EYE_Close` (blink) blendshapes rather than the ARKit-named ones, which this stock export does not include. `Avatar.tsx` detects the ARKit names and falls back automatically when they are absent, so a different model with ARKit blendshapes also works.

Getting here took three attempts, which is worth recording:

- **Ready Player Me** was the original plan. Netflix acquired RPM and shut it down on 31 January 2026.
- **Avaturn** (photorealistic, selfie-based) was next. Its export carried a permanent mouth-geometry artefact baked in from the source photo that no combination of blendshapes could fix. Those files are kept locally but are deliberately **not committed**, because their redistribution licence could not be verified.
- **A third-party modified VRoid model** was tried after that and turned out to be licensed "redistribution prohibited". It was removed before ever being committed.

To use your own, drop a `.glb` or `.vrm` with compatible blendshape names into `frontend/public/` and point `NEXT_PUBLIC_AVATAR_URL` at it. Check that its licence permits redistribution before you commit it.

## Cost per lesson

Rough estimates for a 15-minute lesson:

| Service | Cost |
|---|---|
| Claude (with prompt caching) | ~$0.02 |
| ElevenLabs TTS | ~$0.05–0.10 |
| Whisper STT | ~$0.05 |
| Avatar and Three.js | $0 |
| **Total** | **~$0.10–0.20** |

## Roadmap

- [ ] Streaming Claude → ElevenLabs → browser, to cut time-to-first-word
- [ ] Viseme-based lipsync, for phoneme-accurate mouth shapes
- [ ] A2–C2 lessons
- [ ] Pronunciation scoring
- [ ] Progress tracking and spaced repetition (needs Postgres)
- [ ] Auth
