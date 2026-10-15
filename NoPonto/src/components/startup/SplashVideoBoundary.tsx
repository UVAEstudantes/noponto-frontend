import { Component, type PropsWithChildren } from "react";
import { startupLog } from "./startupDiagnostics";

// The parent remains mounted to show the logo and wait for the map independently.
export default class SplashVideoBoundary extends Component<
  PropsWithChildren<{ onComplete: () => void }>,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    startupLog("player.creationError", { message: error.message });
    this.props.onComplete();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
