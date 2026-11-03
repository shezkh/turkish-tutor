"""Centralised config — reads .env at startup."""
import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL")
ELEVENLABS_MODEL = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")

FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

if not ANTHROPIC_API_KEY:
    print("WARNING: ANTHROPIC_API_KEY is not set — /chat will fail.")
if not ELEVENLABS_API_KEY:
    print("WARNING: ELEVENLABS_API_KEY is not set — audio will be skipped.")
if not OPENAI_API_KEY:
    print("WARNING: OPENAI_API_KEY is not set — mic input (Whisper STT) will fail.")
