import * as SplashScreen from "expo-splash-screen";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, Image, StyleSheet } from "react-native";
import SplashVideoBoundary from "./SplashVideoBoundary";
import StartupLogo from "./StartupLogo";
import { startupDiagnosticsEnabled, startupLog } from "./startupDiagnostics";
import { useStartupTransition } from "./useStartupTransition";

type Props = { appReady: boolean; onComplete: () => void };
const FIRST_FRAME_TIMEOUT_MS = 3000;
const EXPECTED_DURATION_SECONDS = 5;
const PLAYBACK_MARGIN_SECONDS = 2;
// Keep the surface used by the Android release validation; no lab override.
const SURFACE_TYPE = "textureView";

// Kept separate so ending/failing unmounts the hook and releases the native player
// immediately, even if the map is still loading.
export function SplashVideoPlayer({
  onFinish,
}: {
  onFinish: (reason: string) => void;
}) {
  const firstFrame = useRef(false);
  const finished = useRef(false);
  const foreground = useRef(
    AppState.currentState !== "background" && AppState.currentState !== "inactive",
  );
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const player = useVideoPlayer(
    require("../../../assets/vids/splash.mp4"),
    (video) => {
      video.loop = false;
      video.muted = true;
      video.audioMixingMode = "mixWithOthers";
    },
  );
  const finish = useCallback(
    (reason: string) => {
      if (finished.current) return;
      finished.current = true;
      clearTimeout(deadline.current);
      startupLog("video.finished", {
        reason,
        firstFrame: firstFrame.current,
        currentTime: player.currentTime,
        duration: player.duration,
      });
      try {
        player.pause();
      } catch (error) {
        startupLog("player.pauseError", String(error));
      }
      onFinish(reason);
    },
    [onFinish, player],
  );

  const armDeadline = useCallback(() => {
    clearTimeout(deadline.current);
    if (finished.current || !foreground.current) return;
    if (!firstFrame.current) {
      deadline.current = setTimeout(() => {
        startupLog("video.firstFrameTimeout", { status: player.status });
        finish("firstFrameTimeout");
      }, FIRST_FRAME_TIMEOUT_MS);
      return;
    }
    const duration = Number.isFinite(player.duration) && player.duration > 0 && player.duration <= 10
      ? player.duration : EXPECTED_DURATION_SECONDS;
    const position = Number.isFinite(player.currentTime)
      ? Math.max(0, Math.min(player.currentTime, duration)) : 0;
    deadline.current = setTimeout(() => {
      startupLog("video.playbackTimeout");
      finish("playbackTimeout");
    }, (duration - position + PLAYBACK_MARGIN_SECONDS) * 1000);
  }, [finish, player]);

  useEffect(() => {
    // Subscribe before play and inspect status in case a load event was already sent.
    startupLog(
      "asset.resolved",
      Image.resolveAssetSource(require("../../../assets/vids/splash.mp4")),
    );
    startupLog("player.created", {
      status: player.status,
      playing: player.playing,
      currentTime: player.currentTime,
      duration: player.duration,
      surfaceType: SURFACE_TYPE,
    });
    const requestPlay = (phase: string) => {
      if (finished.current || !foreground.current) return;
      try {
        startupLog("player.playRequested", { phase, status: player.status });
        player.play();
      } catch (error) {
        startupLog("player.playError", String(error));
        finish("playError");
      }
    };
    const lifecycle = AppState.addEventListener("change", (state) => {
      const wasForeground = foreground.current;
      foreground.current = state === "active";
      startupLog("app.state", { state, currentTime: player.currentTime });
      if (!foreground.current) clearTimeout(deadline.current);
      else if (!wasForeground && !finished.current) {
        armDeadline();
        requestPlay("foreground");
      }
    });
    const subscriptions = [
      player.addListener("playToEnd", () => finish("playToEnd")),
      player.addListener("statusChange", ({ status, error }) => {
        startupLog("player.status", {
          status,
          error,
          currentTime: player.currentTime,
          duration: player.duration,
        });
        if (status === "error") finish("nativeError");
        else if (status === "readyToPlay") requestPlay("readyToPlay");
      }),
      player.addListener("playingChange", ({ isPlaying }) => {
        startupLog("player.playing", {
          isPlaying,
          currentTime: player.currentTime,
          duration: player.duration,
        });
      }),
      player.addListener("sourceLoad", ({ duration }) => {
        startupLog("asset.loaded", { duration });
      }),
    ];
    const progress = startupDiagnosticsEnabled()
      ? setInterval(() => {
          if (!finished.current)
            startupLog("player.progress", {
              currentTime: player.currentTime,
              duration: player.duration,
              status: player.status,
              playing: player.playing,
              firstFrame: firstFrame.current,
            });
        }, 1000)
      : undefined;
    armDeadline();
    if (player.status === "error") finish("initialError");
    else requestPlay("mounted");
    return () => {
      clearTimeout(deadline.current);
      clearInterval(progress);
      lifecycle.remove();
      subscriptions.forEach((subscription) => subscription.remove());
      startupLog("player.unmounted");
      // useVideoPlayer owns release; never release its shared object manually.
    };
  }, [armDeadline, finish, player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="cover"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      startsPictureInPictureAutomatically={false}
      // TextureView participates in the overlay's alpha/composition over the WebView.
      // Keep fixed; switching surface type during playback is unsupported.
      surfaceType={SURFACE_TYPE}
      pointerEvents="none"
      onFirstFrameRender={() => {
        if (finished.current || firstFrame.current) return;
        firstFrame.current = true;
        clearTimeout(deadline.current);
        startupLog("video.firstFrame", { duration: player.duration });
        armDeadline();
      }}
    />
  );
}

export default function SplashVideoOverlay({ appReady, onComplete }: Props) {
  const [ended, setEnded] = useState(false);
  const opacity = useStartupTransition(ended, appReady, onComplete);
  const finish = useCallback(() => setEnded(true), []);
  useEffect(() => {
    startupLog("overlay.mounted", { mode: "video" });
  }, []);
  return (
    <Animated.View
      style={[styles.overlay, { opacity }]}
      onLayout={() => {
        // Android's native splash blocks pre-draw. Waiting for a TextureView frame
        // before hiding it creates a cycle. The black overlay is already laid out.
        startupLog("overlay.layout", { mode: "video" });
        void SplashScreen.hideAsync()
          .then(() => startupLog("splash.hidden"))
          .catch((error) => startupLog("splash.hideError", String(error)));
      }}
      accessibilityViewIsModal
    >
      {ended ? (
        !appReady ? (
          <>
            <StartupLogo />
            {!appReady && (
              <ActivityIndicator
                color="#aaaaaa"
                accessibilityLabel="Carregando mapa"
                style={{ position: "absolute", bottom: "25%" }}
              />
            )}
          </>
        ) : null
      ) : (
        <SplashVideoBoundary onComplete={finish}>
          <SplashVideoPlayer onFinish={finish} />
        </SplashVideoBoundary>
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
