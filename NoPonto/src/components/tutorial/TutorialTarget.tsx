import { transportSearchStep } from "./tutorialSteps";
import { observeTutorialTarget } from "./tutorialMeasurement";
import React, { useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  useWindowDimensions,
  Keyboard,
  type ViewProps,
  type PressableProps,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useTutorial } from "./TutorialProvider";
export default function TutorialTarget({
  children,
  kind = "input",
  enabled = true,
  component: Component = View,
  clipRef,
  onLayout,
  reveal = false,
  ...props
}: ViewProps & {
  kind?: "input" | "results" | "stopPanel" | "line" | "radar" | "filter";
  enabled?: boolean;
  reveal?: boolean;
  onPress?: PressableProps["onPress"];
  clipRef?: React.RefObject<ScrollView | null>;
  component?: React.ElementType<ViewProps & React.RefAttributes<View>>;
}) {
  const ref = useRef<View>(null);
  const revealed = useRef<string | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const tutorial = useTutorial();
  const { step } = tutorial;
  const setTarget =
    kind === "filter" ? tutorial.setFilterTarget : kind === "radar" ? tutorial.setRadarTarget : kind === "line"
      ? tutorial.setLineTarget
      : kind === "stopPanel"
        ? tutorial.setStopTarget
        : kind === "results"
          ? tutorial.setResultsTarget
          : tutorial.setTarget;
  const focused = useIsFocused();
  const dimensions = useWindowDimensions();
  useEffect(() => {
    if (
      (kind === "filter" ? !transportSearchStep(step) : kind === "radar" ? tutorial.chapter !== 5 : kind === "line"
        ? !step?.startsWith("line")
        : kind === "stopPanel"
          ? step !== "stopDetails"
          : kind === "input"
            ? !step
            : step !== "search" && !transportSearchStep(step)) ||
      !focused ||
      !enabled
    )
      return;
    let live = true;
    const revealKey = String(step) + tutorial.radarHost;
    if (reveal && revealed.current !== revealKey && clipRef?.current) {
      revealed.current = revealKey;
      const inner = clipRef.current.getInnerViewNode();
      if (inner) ref.current?.measureLayout(inner, (_x, y) => { if (live) clipRef.current?.scrollTo({y: Math.max(0, y - 8), animated: false}); }, () => {});
    }
    const observation = observeTutorialTarget((done) => {
      if (!ref.current) {
        done(null);
        return;
      }
      ref.current.measureInWindow((x, y, width, height) => {
        const update = (left: number, top: number, w: number, h: number) => {
          const right = Math.min(dimensions.width, left + w),
            bottom = Math.min(dimensions.height, top + h);
          left = Math.max(0, left);
          top = Math.max(0, top);
          done(
            [left, top, right, bottom].every(Number.isFinite) &&
              right > left &&
              bottom > top
              ? { x: left, y: top, width: right - left, height: bottom - top }
              : null,
          );
        };
        const viewport = clipRef?.current?.getNativeScrollRef();
        if (viewport)
          viewport.measureInWindow(
            (cx: number, cy: number, cw: number, ch: number) => {
              const left = Math.max(x, cx),
                top = Math.max(y, cy);
              update(
                left,
                top,
                Math.max(0, Math.min(x + width, cx + cw) - left),
                Math.max(0, Math.min(y + height, cy + ch) - top),
              );
            },
          );
        else update(x, y, width, height);
      });
    }, setTarget);
    refreshRef.current = observation.refresh;
    const show = Keyboard.addListener("keyboardDidShow", observation.refresh);
    const hide = Keyboard.addListener("keyboardDidHide", observation.refresh);
    return () => {
      live = false;
      refreshRef.current = null;
      observation.stop();
      show.remove();
      hide.remove();
    };
  }, [
    kind === "input" ? Boolean(step) : step,
    kind,
    clipRef,
    kind === "input" ? null : tutorial.lineContext?.key,
    kind === "input" ? null : tutorial.geometryVersion,
    tutorial.radarHost,
    reveal,
    focused,
    enabled,
    dimensions.width,
    dimensions.height,
    dimensions.fontScale,
    setTarget,
  ]);
  return (
    <Component
      {...props}
      ref={ref}
      collapsable={false}
      onLayout={(event) => {
        refreshRef.current?.();
        onLayout?.(event);
      }}
    >
      {children}
    </Component>
  );
}
