import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import { startupLog } from "./startupDiagnostics";

export function useStartupTransition(
  readyToFinish: boolean,
  appReady: boolean,
  onComplete: () => void,
) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [waitingExpired, setWaitingExpired] = useState(false);
  useEffect(() => {
    if (appReady) return;
    // Map budget runs in parallel with video, never restarts on video failure.
    const deadline = setTimeout(() => {
      startupLog("map.waitTimeout");
      setWaitingExpired(true);
    }, 8000);
    return () => clearTimeout(deadline);
  }, [appReady]);
  useEffect(() => {
    startupLog("transition.state", { readyToFinish, appReady, waitingExpired });
  }, [readyToFinish, appReady, waitingExpired]);
  useEffect(() => {
    if (!readyToFinish || (!appReady && !waitingExpired)) return;
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) {
        startupLog("overlay.removed", { appReady, waitingExpired });
        onComplete();
      }
    });
    return () => animation.stop();
  }, [appReady, readyToFinish, onComplete, opacity, waitingExpired]);
  return opacity;
}
