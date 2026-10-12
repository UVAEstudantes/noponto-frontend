import { useEffect, useRef, useState } from "react";
import { Animated } from "react-native";

export function useStartupTransition(
  readyToFinish: boolean,
  appReady: boolean,
  onComplete: () => void,
) {
  const opacity = useRef(new Animated.Value(1)).current;
  const [waitingExpired, setWaitingExpired] = useState(false);
  useEffect(() => {
    if (!readyToFinish) return;
    const deadline = setTimeout(() => setWaitingExpired(true), 8000);
    return () => clearTimeout(deadline);
  }, [readyToFinish]);
  useEffect(() => {
    if (!readyToFinish || (!appReady && !waitingExpired)) return;
    const animation = Animated.timing(opacity, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onComplete();
    });
    return () => animation.stop();
  }, [appReady, readyToFinish, onComplete, opacity, waitingExpired]);
  return opacity;
}
