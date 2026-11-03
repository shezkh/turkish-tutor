"""The tutor brain, behind one interface.

Builds a system prompt from the persona plus the current lesson, then calls
whichever provider LLM_PROVIDER names. Everything else in the app only ever
calls generate_tutor_reply() and never learns which model answered.

Anthropic is the default and the only path using prompt caching, since the
cache_control blocks are provider-specific. Provider SDKs are imported inside
their own function so a missing optional dependency cannot break the app.
"""
from pathlib import Path

from app.config import (
    ANTHROPIC_API_KEY,
    CLAUDE_MODEL,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    LLM_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_MODEL,
)

_PERSONA_PATH = Path(__file__).resolve().parent.parent / "prompts" / "tutor_persona.md"
_PERSONA = _PERSONA_PATH.read_text()

MAX_TOKENS = 400


# --- prompt building -------------------------------------------------------

def _lesson_brief(lesson: dict) -> str:
    return (
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


def _system_text(lesson: dict) -> str:
    """Flat system prompt, for providers that take a single string."""
    return f"{_PERSONA}\n\n{_lesson_brief(lesson)}"


def _system_blocks(lesson: dict) -> list[dict]:
    """Two cacheable blocks for Anthropic: persona (stable) + lesson (per lesson)."""
    return [
        {"type": "text", "text": _PERSONA, "cache_control": {"type": "ephemeral"}},
        {
            "type": "text",
            "text": _lesson_brief(lesson),
            "cache_control": {"type": "ephemeral"},
        },
    ]


# --- providers -------------------------------------------------------------

async def _anthropic(history: list[dict], lesson: dict) -> str:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)
    resp = await client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=MAX_TOKENS,
        system=_system_blocks(lesson),
        messages=history,
    )
    return "".join(b.text for b in resp.content if b.type == "text").strip()


async def _openai(history: list[dict], lesson: dict) -> str:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=OPENAI_API_KEY)
    resp = await client.chat.completions.create(
        model=OPENAI_MODEL,
        max_tokens=MAX_TOKENS,
        messages=[{"role": "system", "content": _system_text(lesson)}, *history],
    )
    return (resp.choices[0].message.content or "").strip()


async def _gemini(history: list[dict], lesson: dict) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    # Gemini calls the assistant role "model".
    contents = [
        {
            "role": "model" if m["role"] == "assistant" else "user",
            "parts": [{"text": m["content"]}],
        }
        for m in history
    ]
    resp = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=_system_text(lesson),
            max_output_tokens=MAX_TOKENS,
        ),
    )
    return (resp.text or "").strip()


_PROVIDERS = {
    "anthropic": (_anthropic, ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
    "openai": (_openai, OPENAI_API_KEY, "OPENAI_API_KEY"),
    "gemini": (_gemini, GEMINI_API_KEY, "GEMINI_API_KEY"),
}


# --- public interface ------------------------------------------------------

async def generate_tutor_reply(history: list[dict], lesson: dict) -> str:
    provider = _PROVIDERS.get(LLM_PROVIDER)
    if provider is None:
        return (
            f"[Unknown LLM_PROVIDER {LLM_PROVIDER!r} — "
            f"choose one of: {', '.join(sorted(_PROVIDERS))}]"
        )

    call, api_key, key_name = provider
    if not api_key:
        return f"[LLM not configured — set {key_name} in backend/.env]"

    # An empty conversation gets a nudge so the tutor opens the lesson itself.
    if not history:
        history = [{"role": "user", "content": "(start the lesson)"}]

    return await call(history, lesson)
