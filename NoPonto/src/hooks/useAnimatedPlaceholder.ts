import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export const PLACEHOLDER_TIMING = { typing: 105, deleting: 65, hold: 1250, between: 320 } as const;

export function embaralharSugestoes(values: readonly string[], rng: () => number = Math.random,
  avoidFirst?: string) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  if (result.length > 1 && result[0] === avoidFirst) {
    [result[0], result[1]] = [result[1], result[0]];
  }
  return result;
}

export function useAnimatedPlaceholder(suggestions: string[], active: boolean) {
  const [text, setText] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || suggestions.length === 0) { setText(""); return; }
    if (reduceMotion) { setText(suggestions[0]); return; }
    let mounted = true, bag = embaralharSugestoes(suggestions), index = 0, cursor = 0, deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!mounted) return;
      const value = bag[index] ?? "";
      cursor += deleting ? -1 : 1;
      setText(value.slice(0, Math.max(0, cursor)));
      let delay: number = deleting ? PLACEHOLDER_TIMING.deleting : PLACEHOLDER_TIMING.typing;
      if (!deleting && cursor >= value.length) { deleting = true; delay = PLACEHOLDER_TIMING.hold; }
      else if (deleting && cursor <= 0) {
        deleting = false; index++;
        if (index >= bag.length) { bag = embaralharSugestoes(suggestions, Math.random, value); index = 0; }
        delay = PLACEHOLDER_TIMING.between;
      }
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 250);
    return () => { mounted = false; clearTimeout(timer); };
  }, [active, reduceMotion, suggestions]);
  return text;
}
