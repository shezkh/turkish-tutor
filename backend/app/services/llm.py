"""Claude wrapper for the tutor brain.

Builds a system prompt from the persona + the current lesson, then calls Claude.
Uses prompt caching on the persona/lesson block so repeated turns are cheap.
"""
from pathlib import Path

from anthropic import AsyncAnthropic

from app.config import ANTHROPIC_API_KEY, CLAUDE_MODEL

_client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

_PERSONA_PATH = Path(__file__).resolve().parent.parent / "prompts" / "tutor_persona.md"
_PERSONA = _PERSONA_PATH.read_text()


def _system_blocks(lesson: dict) -> list[dict]:
    """Two cacheable system blocks: persona (stable) + lesson (changes per lesson)."""
    lesson_brief = (
        f"# CURRENT LESSON\n\n"
        f"Lesson id: {lesson['id']}\n"
        f"Level: {lesson['level']}\n"
        f"Title: {lesson['title']}\n\n"
        f"## Objectives\n" + "\n".join(f"- {o}" for o in lesson["objectives"]) + "\n\n"
        f"## Key vocabulary\n"
        + "\n".join(f"- {v['tr']} — {v['en']}" for v in lesson["key_vocabulary"])
        + "\n\n"
        f"## Opening line (use only at the very start of the conversation)\n"
        f"{lesson['opening_line']}\n"
    )
    return [
        {
            "type": "text",
            "text": _PERSONA,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": lesson_brief,
            "cache_control": {"type": "ephemeral"},
        },
    ]


async def generate_tutor_reply(history: list[dict], lesson: dict) -> str:
    if _client is None:
        return "[LLM not configured — set ANTHROPIC_API_KEY in backend/.env]"

    # If the conversation is empty, seed it with a "please greet me" turn so the
    # tutor opens the lesson.
    if not history:
        history = [{"role": "user", "content": "(start the lesson)"}]

    resp = await _client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=400,
        system=_system_blocks(lesson),
        messages=history,
    )

    # Concatenate any text blocks.
    return "".join(b.text for b in resp.content if b.type == "text").strip()
