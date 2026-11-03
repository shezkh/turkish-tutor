"use client";

import { useEffect, useState } from "react";
import TutorScene from "@/components/TutorScene";
import ChatPanel from "@/components/ChatPanel";
import { getLessons, type LessonSummary } from "@/lib/api";

const DEFAULT_LESSON_ID = "a1-lesson-01";

export default function Home() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [lessonId, setLessonId] = useState(DEFAULT_LESSON_ID);

  useEffect(() => {
    getLessons()
      .then(setLessons)
      .catch((e) => console.error("Failed to load lessons:", e));
  }, []);

  const current = lessons.find((l) => l.id === lessonId);

  return (
    <main className="grid h-screen grid-cols-1 md:grid-cols-[1fr_420px]">
      <div className="relative">
        <TutorScene />
        <div className="absolute left-4 top-4 rounded-lg bg-slate-900/70 px-3 py-2 text-sm">
          <div className="font-semibold">Deniz</div>
          <div className="text-slate-300">
            Turkish tutor · {current ? `${current.level} · ${current.title}` : "…"}
          </div>
          {lessons.length > 0 && (
            <select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              className="mt-2 w-full rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none"
            >
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.level} · {l.title}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      {/* key={lessonId} remounts ChatPanel on lesson change, resetting the
          conversation cleanly instead of hand-rolling reset logic. */}
      <ChatPanel key={lessonId} lessonId={lessonId} />
    </main>
  );
}
