"""Centralised config — reads .env at startup."""
import os
from dotenv import load_dotenv

load_dotenv()

# Which model answers as the tutor: anthropic | openai | gemini
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic").strip().lower()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Model names move. Check the provider's current list if a call 404s.
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
# Gemini 3.x reasons before answering by default, which costs seconds and eats
# the output budget. A tutor reply does not need it. 0 disables; a negative
# value leaves the model's own default alone.
GEMINI_THINKING_BUDGET = int(os.getenv("GEMINI_THINKING_BUDGET", "0"))
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

_LLM_KEYS = {
    "anthropic": ("ANTHROPIC_API_KEY", ANTHROPIC_API_KEY),
    "openai": ("OPENAI_API_KEY", OPENAI_API_KEY),
    "gemini": ("GEMINI_API_KEY", GEMINI_API_KEY),
}

if LLM_PROVIDER not in _LLM_KEYS:
    print(
        f"WARNING: LLM_PROVIDER={LLM_PROVIDER!r} is not one of "
        f"{', '.join(sorted(_LLM_KEYS))} — /chat will fail."
    )
elif not _LLM_KEYS[LLM_PROVIDER][1]:
    print(
        f"WARNING: LLM_PROVIDER is {LLM_PROVIDER} but "
        f"{_LLM_KEYS[LLM_PROVIDER][0]} is not set — /chat will fail."
    )
if not ELEVENLABS_API_KEY:
    print("WARNING: ELEVENLABS_API_KEY is not set — audio will be skipped.")
if not OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY is not set — mic input (Whisper STT) will fail.")
