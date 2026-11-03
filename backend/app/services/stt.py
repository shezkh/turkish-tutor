"""OpenAI Whisper STT — transcribes recorded mic audio to text.

No `language` hint is passed: lessons expect mixed Turkish/English replies
(see tutor_persona.md's English budget), and forcing Turkish would hurt
accuracy on the English portions.
"""
from openai import AsyncOpenAI

from app.config import OPENAI_API_KEY

_client = AsyncOpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None


async def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    if _client is None:
        raise RuntimeError("OPENAI_API_KEY not set")

    resp = await _client.audio.transcriptions.create(
        model="whisper-1",
        file=(filename, audio_bytes),
    )
    return resp.text.strip()
