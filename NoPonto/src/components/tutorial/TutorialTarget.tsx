import { transportSearchStep } from "./tutorialSteps";
import React, { useEffect, useRef } from "react";
import {
  View,
  ScrollView,
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
  dimmed = false,
  ...props
}: ViewProps & {
  kind?: "input" | "results" | "stopPanel" | "line" | "radar" | "filter";
  enabled?: boolean;
  reveal?: boolean;
  dimmed?: boolean;
  onPress?: PressableProps["onPress"];
  clipRef?: React.RefObject<ScrollView | null>;
  component?: React.ElementType<ViewProps & React.RefAttributes<View>>;
}) {
  const ref = useRef<View>(null);
  const tutorial = useTutorial();
  const { step } = tutorial;
  const focused = useIsFocused();
  const direct = Boolean(step);
  const highlighted = direct && enabled && focused &&
    ((step === "search" && (kind === "input" || kind === "results")) ||
      (step === "stopDetails" && kind === "stopPanel") ||
      (tutorial.chapter === 4 && kind === "line") ||
      (transportSearchStep(step) && (kind === "input" || kind === "filter" || kind === "results")) ||
      (step === "transportMap" && kind === "input") ||
      (tutorial.chapter === 5 && kind === "radar"));
  useEffect(() => {
    if (!highlighted || !reveal || !clipRef?.current || (kind === "line" && !tutorial.lineModalOpen)) return;
    let live = true;
    const scroll = clipRef.current as ScrollView & { getInnerViewRef(): View | null };
    const target = ref.current;
    // Fabric requires the native instance, not the numeric handle from getInnerViewNode.
    const inner = scroll.getInnerViewRef();
    if (inner && typeof inner.measureLayout === "function" && target) target.measureLayout(inner, (_x, y) => {
      if (live && ref.current === target && clipRef.current === scroll && scroll.getInnerViewRef() === inner)
        scroll.scrollTo({ y: Math.max(0, y - 8), animated: false });
    }, () => {});
    return () => { live = false; };
  }, [highlighted, reveal, clipRef, step, tutorial.radarHost, tutorial.lineModalOpen, kind]);
  return (
    <Component
      {...props}
      style={[props.style, highlighted && { outlineWidth: 2, outlineColor: "#FFC107", outlineOffset: -2 }, dimmed && !highlighted && { opacity: 0.72 }]}
      ref={ref}
      collapsable={false}
      onLayout={(event) => {
        onLayout?.(event);
      }}
    >
      {children}
    </Component>
  );
}
