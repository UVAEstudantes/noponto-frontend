import type { TutorialRect } from "./tutorialSteps";
export function observeTutorialTarget(
  read: (done: (rect: TutorialRect | null) => void) => void,
  write: (rect: TutorialRect | null) => void,
  schedule = requestAnimationFrame,
  cancel = cancelAnimationFrame,
) {
  let live = true,
    version = 0,
    frame: number | null = null;
  const refresh = () => {
    const current = ++version;
    if (frame !== null) cancel(frame);
    write(null);
    let previous: TutorialRect | null = null,
      stable = 0,
      attempts = 0;
    const sample = () => {
      frame = null;
      read((rect) => {
        if (!live || current !== version) return;
        const same =
          rect &&
          previous &&
          (["x", "y", "width", "height"] as const).every(
            (key) => Math.abs(rect[key] - previous![key]) < 0.5,
          );
        stable = same ? stable + 1 : 0;
        previous = rect;
        if (!rect || stable >= 2) {
          write(rect);
          return;
        }
        // Only sample a bounded layout transition; scroll/layout events restart observation.
        if (++attempts < 60) frame = schedule(sample);
      });
    };
    frame = schedule(sample);
  };
  refresh();
  return {
    refresh,
    stop: () => {
      live = false;
      ++version;
      if (frame !== null) cancel(frame);
      write(null);
    },
  };
}
