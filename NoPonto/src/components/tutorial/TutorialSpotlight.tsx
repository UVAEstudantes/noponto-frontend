import React from "react";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import type { TutorialRect } from "./tutorialSteps";
// Measured geometry must not interpolate from a position the component has already left.
export default function TutorialSpotlight({
  rect,
}: {
  rect: TutorialRect | null;
  owner: string;
  reducedMotion: boolean;
}) {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <Mask id="tutorial-hole">
          <Rect width="100%" height="100%" fill="white" />
          {rect && <Rect {...rect} rx={16} fill="black" />}
        </Mask>
      </Defs>
      <Rect
        width="100%"
        height="100%"
        fill="#00000035"
        mask="url(#tutorial-hole)"
      />
      {rect && (
        <Rect
          {...rect}
          rx={16}
          fill="none"
          stroke="#FFC107"
          strokeWidth={1.5}
        />
      )}
    </Svg>
  );
}
