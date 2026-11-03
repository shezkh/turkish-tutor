"use client";

import { useEffect, useRef, useState } from "react";
import { postChat, transcribeAudio, type ChatMessage } from "@/lib/api";
import { lipsync } from "@/lib/lipsync";

type Props = { lessonId: string };

export default function ChatPanel({ lessonId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" });
  }, [messages]);

  /**
   * Plays MP3 audio and drives `lipsync.value` from its loudness. Hardened
   * so any failure (browser autoplay block, decoder error, etc.) returns
   * cleanly instead of hanging — otherwise the busy state would stick.
   */
  async function playAudioWithLipsync(b64: string, mime: string) {
    let raf = 0;
    let url = "";
    try {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime });
      url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audio.crossOrigin = "anonymous";

      const ctx = (audioCtxRef.current ??= new AudioContext());
      // Fire-and-forget — never `await` resume(), it can hang indefinitely
      // if the browser hasn't seen a user gesture yet.
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});

      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyser.connect(ctx.destination);

      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        // Gain tuned for the VRoid avatar's "Fcl_MTH_A" mouth-open shape —
        // typical speech RMS is ~0.1-0.2, so *3 maps that to a clearly
        // visible open mouth without pinning at max on every syllable.
        lipsync.value = Math.min(1, rms * 3);
        raf = requestAnimationFrame(tick);
      };

      audio.onended = () => {
        cancelAnimationFrame(raf);
        lipsync.value = 0;
        URL.revokeObjectURL(url);
      };

      // Wait until playback actually begins or fails. Resolves quickly.
      try {
        await audio.play();
        tick();
      } catch (err) {
        console.warn("Audio play blocked or failed:", err);
        cancelAnimationFrame(raf);
        lipsync.value = 0;
        if (url) URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Lipsync setup failed:", e);
      cancelAnimationFrame(raf);
      lipsync.value = 0;
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function send(extra: ChatMessage[]) {
    if (busy) return;
    setBusy(true);
    try {
      const next = [...messages, ...extra];
      setMessages(next);
      const res = await postChat(next, lessonId);
      const replyMsg: ChatMessage = { role: "assistant", content: res.reply };
      setMessages([...next, replyMsg]);
      if (res.audio_base64) {
        await playAudioWithLipsync(res.audio_base64, res.audio_mime);
      }
    } catch (e) {
      console.error(e);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `(error: ${(e as Error).message})` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Hold-to-talk mic recording. Mirrors playAudioWithLipsync's defensive
   * style: any failure (denied permission, unsupported browser, transcribe
   * error) surfaces as a chat message instead of hanging the UI.
   */
  async function startRecording() {
    if (busy || recording || transcribing || !started) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        // Skip near-empty recordings (accidental taps) — not worth a
        // Whisper round trip.
        if (blob.size < 1000) return;

        setTranscribing(true);
        try {
          const text = await transcribeAudio(blob);
          if (text.trim()) void send([{ role: "user", content: text.trim() }]);
        } catch (e) {
          console.error("Transcription failed:", e);
          setMessages((m) => [
            ...m,
            { role: "assistant", content: `(mic error: ${(e as Error).message})` },
          ]);
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (e) {
      console.warn("Microphone access failed:", e);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "(couldn't access the microphone — check your browser's permission for this site)",
        },
      ]);
    }
  }

  function stopRecording() {
    if (!recording) return;
    setRecording(false);
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  async function handleStart() {
    setStarted(true);
    await send([]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send([{ role: "user", content: text }]);
  }

  return (
    <aside className="flex h-full flex-col border-l border-slate-800 bg-slate-950/60">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto p-4 text-sm"
      >
        {!started && messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-4 text-center text-slate-300">
            <p>
              Click below to start your lesson.
              <br />
              <span className="text-xs text-slate-500">
                (Your browser needs a click before it can play audio.)
              </span>
            </p>
            <button
              type="button"
              onClick={handleStart}
              disabled={busy}
              className="rounded-md bg-sky-600 px-6 py-3 font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-40"
            >
              Start lesson with Deniz
            </button>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-lg bg-sky-700/60 px-3 py-2"
                : "mr-8 rounded-lg bg-slate-800 px-3 py-2"
            }
          >
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="mr-8 rounded-lg bg-slate-800 px-3 py-2 italic text-slate-400">
            Deniz is thinking…
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-slate-800 p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={(e) => {
              e.preventDefault();
              void startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            disabled={!started || busy || transcribing}
            title="Hold to talk"
            className={`select-none rounded-md px-3 py-2 font-medium disabled:opacity-40 ${
              recording
                ? "animate-pulse bg-red-600"
                : "bg-slate-700 hover:bg-slate-600"
            }`}
          >
            🎤
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              started
                ? "Reply to Deniz… (Türkçe veya English)"
                : "Click 'Start lesson' first"
            }
            className="flex-1 rounded-md bg-slate-800 px-3 py-2 outline-none ring-sky-500 focus:ring-2 disabled:opacity-50"
            disabled={!started || busy || recording || transcribing}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim() || !started}
            className="rounded-md bg-sky-600 px-4 py-2 font-medium disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <div className="mt-2 text-xs text-slate-500">
          {recording
            ? "🔴 Recording… release to send"
            : transcribing
              ? "Transcribing…"
              : "Hold 🎤 to talk, or type your reply."}
        </div>
      </form>
    </aside>
  );
}
