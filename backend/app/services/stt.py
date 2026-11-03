"""Speech to text, behind one interface.

Turns recorded mic audio into text using whichever provider STT_PROVIDER
names. Callers only ever use transcribe() and never learn who answered.

No language hint is given: lessons expect mixed Turkish/English replies (see
tutor_persona.md's English budget), and forcing Turkish would hurt accuracy on
the English portions.

Provider SDKs are imported inside their own function so a missing or broken
optional dependency cannot take down the whole API at import time.
"""
from app.config import (
    GEMINI_API_KEY,
    GEMINI_STT_MODEL,
    OPENAI_API_KEY,
    STT_PROVIDER,
    WHISPER_MODEL,
)

# Browsers hand us webm/opus; the rest are here so a different recorder works.
_MIME_BY_EXT = {
    "webm": "audio/webm",
    "ogg": "audio/ogg",
    "oga": "audio/ogg",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "flac": "audio/flac",
    "aac": "audio/aac",
}

_PROMPT = (
    "Transcribe the speech in this audio exactly as it was spoken. "
    "The speaker is a Turkish learner and may mix Turkish and English, and may "
    "mispronounce words — write what they actually said, do not correct it. "
    "Return only the transcription: no commentary, no translation, no quotation "
    "marks, no speaker labels. If there is no intelligible speech, return nothing."
)


def _mime_for(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _MIME_BY_EXT.get(ext, "audio/webm")


async def _openai(audio_bytes: bytes, filename: str) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    resp = await client.audio.transcriptions.create(
        model=WHISPER_MODEL,
        file=(filename, audio_bytes),
    )
    return resp.text.strip()


async def _gemini(audio_bytes: bytes, filename: str) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    resp = await client.aio.models.generate_content(
        model=GEMINI_STT_MODEL,
        contents=[
            types.Part.from_bytes(data=audio_bytes, mime_type=_mime_for(filename)),
            _PROMPT,
        ],
    )
    text = (resp.text or "").strip()
    # A general model occasionally wraps the transcription in quotes.
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        text = text[1:-1].strip()
    return text


# provider -> (call, api key, key name, pip package)
_PROVIDERS = {
    "openai": (_openai, OPENAI_API_KEY, "OPENAI_API_KEY", "openai"),
    "gemini": (_gemini, GEMINI_API_KEY, "GEMINI_API_KEY", "google-genai"),
}


async def transcribe(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    provider = _PROVIDERS.get(STT_PROVIDER)
    if provider is None:
        raise RuntimeError(
            f"Unknown STT_PROVIDER {STT_PROVIDER!r} — "
            f"choose one of: {', '.join(sorted(_PROVIDERS))}"
        )

    call, api_key, key_name, package = provider
    if not api_key:
        raise RuntimeError(f"{key_name} not set")

    try:
        return await call(audio_bytes, filename)
    except ImportError as exc:
        raise RuntimeError(
            f"STT_PROVIDER is {STT_PROVIDER} but its SDK is not installed — "
            f"run: pip install {package}"
        ) from exc
