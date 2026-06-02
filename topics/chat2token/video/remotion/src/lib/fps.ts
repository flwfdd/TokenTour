import { spring, useCurrentFrame, useVideoConfig, type SpringConfig } from "remotion";

/**
 * All scenes are *authored* in 30fps frame-space — every hard-coded keyframe
 * literal (delays, ease windows, sweep ranges) assumes 30 frames per second.
 * These helpers remap that author space onto whatever fps the composition is
 * actually rendered at, so the same code yields identical wall-clock timing at
 * 30fps, 60fps, etc. (At 30fps they are exact identities.)
 */
export const AUTHOR_FPS = 30;

/** Real render fps ÷ author fps (1 at 30fps, 2 at 60fps). */
export const useFpsScale = () => useVideoConfig().fps / AUTHOR_FPS;

/**
 * The current frame expressed in 30fps author space. Pass `clampTo` (an author
 * frame) to hold the final state for the static tail handle.
 */
export const useAuthorFrame = (clampTo?: number) => {
  const f = useCurrentFrame() / useFpsScale();
  return clampTo === undefined ? f : Math.min(f, clampTo);
};

/**
 * A spring authored in 30fps space but physically correct at the real fps.
 * `authorFrame` is the spring's local frame (e.g. `f - delay`) in author space.
 */
export const useAuthorSpring = (authorFrame: number, config: Partial<SpringConfig>) => {
  const { fps } = useVideoConfig();
  return spring({ frame: (authorFrame * fps) / AUTHOR_FPS, fps, config });
};
