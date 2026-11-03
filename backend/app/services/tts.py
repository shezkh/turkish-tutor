"""ElevenLabs TTS — returns MP3 bytes for the given text."""
from elevenlabs.client import AsyncElevenLabs

from app.config import ELEVENLABS_API_KEY, ELEVENLABS_MODEL, ELEVENLABS_VOICE_ID

_client = AsyncElevenLabs(api_key=ELEVENLABS_API_KEY) if ELEVENLABS_API_KEY else None


async def synthesize(text: str) -> bytes:
    if _client is None:
        raise RuntimeError("ELEVENLABS_API_KEY not set")

    # The SDK returns an async iterator of bytes chunks.
    chunks: list[bytes] = []
    async for chunk in _client.text_to_speech.convert(
        voice_id=ELEVENLABS_VOICE_ID,
        model_id=ELEVENLABS_MODEL,
        text=text,
        output_format="mp3_44100_128",
    ):
        chunks.append(chunk)
    return b"".join(chunks)
