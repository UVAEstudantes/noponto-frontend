import React, { Component, type PropsWithChildren } from "react";
import { View } from "react-native";
import * as SplashScreen from "expo-splash-screen";

// Native player creation can fail before playback events are available.
export default class SplashVideoBoundary extends Component<
  PropsWithChildren<{ onComplete: () => void }>,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[SplashVideo] Player indisponível", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View
        style={{ position: "absolute", inset: 0, backgroundColor: "#000000" }}
        onLayout={() => {
          void SplashScreen.hideAsync().catch(() => {});
          this.props.onComplete();
        }}
      />
    );
  }
}
