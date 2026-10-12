import { useEventListener } from "expo";
import * as SplashScreen from "expo-splash-screen";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, StyleSheet } from "react-native";
import { useStartupTransition } from "./useStartupTransition";

type Props = { appReady: boolean; onComplete: () => void };

export default function SplashVideoOverlay({ appReady, onComplete }: Props) {
  const [ended, setEnded] = useState(false);
  const opacity = useStartupTransition(ended, appReady, onComplete);
  const ending = useRef(false);
  const laidOut = useRef(false);
  const frameReady = useRef(false);
  const player = useVideoPlayer(
    require("../../../assets/vids/splash.mp4"),
    (video) => {
      video.loop = false;
      video.muted = true;
      video.audioMixingMode = "mixWithOthers";
    },
  );

  const hideNative = useCallback(() => {
    if (laidOut.current) void SplashScreen.hideAsync().catch(() => {});
  }, []);

  const finish = useCallback(() => {
    if (ending.current) return;
    ending.current = true;
    try {
      player.pause();
    } catch (error) {
      console.warn("[SplashVideo]", error);
    }
    setEnded(true);
    hideNative();
  }, [hideNative, player]);

  useEventListener(player, "playToEnd", finish);
  useEventListener(player, "statusChange", ({ status, error }) => {
    if (status === "error") {
      console.warn("[SplashVideo] Falha na reprodução", error);
      finish();
    }
  });

  useEffect(() => {
    if (player.status === "error") finish();
    else {
      try {
        player.play();
      } catch (error) {
        console.warn("[SplashVideo]", error);
        finish();
      }
    }
    // Recovery only: normal completion always comes from playToEnd.
    const watchdog = setTimeout(() => {
      console.warn("[SplashVideo] Limite de reprodução excedido");
      finish();
    }, 45000);
    return () => clearTimeout(watchdog);
  }, [finish, player]);

  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      onLayout={() => {
        laidOut.current = true;
        if (frameReady.current || ending.current) hideNative();
      }}
      accessibilityViewIsModal
    >
      {!ended && (
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          contentFit="cover"
          nativeControls={false}
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
          surfaceType="textureView"
          pointerEvents="none"
          onFirstFrameRender={() => {
            frameReady.current = true;
            hideNative();
          }}
        />
      )}
      {ended && !appReady && (
        <ActivityIndicator
          color="#aaaaaa"
          accessibilityLabel="Carregando mapa"
        />
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    zIndex: 1000,
    alignItems: "center",
    justifyContent: "center",
  },
});
