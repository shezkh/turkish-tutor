"""POST /api/chat — main tutor endpoint.

Takes the conversation history + a lesson id, returns the tutor's text reply
plus base64-encoded MP3 audio of the same reply spoken by ElevenLabs.
"""
import base64
import json
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.services import llm, stt, tts

router = APIRouter()

CURRICULUM_DIR = Path(__file__).resolve().parent.parent / "curriculum"


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    lesson_id: str = "a1-lesson-01"


class ChatResponse(BaseModel):
    reply: str
    audio_base64: str | None = None
    audio_mime: str = "audio/mpeg"


def _load_lesson(lesson_id: str) -> dict:
    path = CURRICULUM_DIR / f"{lesson_id.replace('-', '_')}.json"
    if not path.exists():
        raise HTTPException(404, f"Lesson {lesson_id} not found")
    return json.loads(path.read_text())


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    lesson = _load_lesson(req.lesson_id)

    reply_text = await llm.generate_tutor_reply(
        history=[m.model_dump() for m in req.messages],
        lesson=lesson,
    )

    audio_b64: str | None = None
    try:
        audio_bytes = await tts.synthesize(reply_text)
        audio_b64 = base64.b64encode(audio_bytes).decode("ascii")
    except Exception as e:
        # Audio is non-fatal — still return text so the UI keeps working.
        print(f"TTS failed: {e}")

    return ChatResponse(reply=reply_text, audio_base64=audio_b64)


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    try:
        text = await stt.transcribe(audio_bytes, filename=file.filename or "audio.webm")
    except Exception as e:
        raise HTTPException(500, f"Transcription failed: {e}")
    return {"text": text}


@router.get("/lessons/{lesson_id}")
async def get_lesson(lesson_id: str):
    return _load_lesson(lesson_id)


@router.get("/lessons")
async def list_lessons():
    summaries = []
    for path in sorted(CURRICULUM_DIR.glob("*.json")):
        lesson = json.loads(path.read_text())
        summaries.append(
            {"id": lesson["id"], "level": lesson["level"], "title": lesson["title"]}
        )
    return summaries
