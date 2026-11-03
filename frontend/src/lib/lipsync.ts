/**
 * Tiny shared store for amplitude-driven lipsync.
 *
 * The audio player (ChatPanel) writes `value` (0..1) on every animation frame
 * based on the current loudness of the playing audio. The Avatar component
 * reads `value` on every frame in useFrame and applies it to the jaw morph
 * target. Module-level mutable object — no React state needed.
 *
 * Phase 2: replace with viseme stream from Azure TTS for phoneme-accurate
 * lipsync (drive multiple morph targets like viseme_aa, viseme_oh, etc.).
 */
export const lipsync = { value: 0 };
