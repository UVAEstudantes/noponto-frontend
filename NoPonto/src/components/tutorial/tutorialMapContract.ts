import type { TutorialRect } from "./tutorialSteps";
export type TutorialMapRequest = {
  requestId: number;
  lineId: string;
  lineName: string;
  modal: string;
  mode: "marker" | "details";
  vehicleId?: string;
  kind?: "vehicle" | "stop";
  reducedMotion: boolean;
};
export type TutorialMapEvent = {
  type: "tutorial_vehicle";
  requestId: number;
  sequence?: number;
  status: "target" | "selected" | "unavailable" | "closed";
  vehicleId?: string;
  rect?: TutorialRect;
  viewport?: { width: number; height: number };
  hasDirection?: boolean;
  hasNextStop?: boolean;
  hasDistance?: boolean;
  statusText?: string;
};
export function mapTutorialRect(
  event: TutorialMapEvent,
  requestId: number,
  frame: TutorialRect,
): TutorialRect | null {
  if (event.requestId !== requestId || !event.rect || !event.viewport)
    return null;
  const { rect: r, viewport: v } = event;
  if (
    ![
      r.x,
      r.y,
      r.width,
      r.height,
      v.width,
      v.height,
      frame.width,
      frame.height,
    ].every(Number.isFinite) ||
    v.width <= 0 ||
    v.height <= 0 ||
    frame.width <= 0 ||
    frame.height <= 0 ||
    r.width <= 0 ||
    r.height <= 0 ||
    r.x < 0 ||
    r.y < 0 ||
    r.x + r.width > v.width + 1 ||
    r.y + r.height > v.height + 1
  )
    return null;
  return {
    x: frame.x + (r.x * frame.width) / v.width,
    y: frame.y + (r.y * frame.height) / v.height,
    width: (r.width * frame.width) / v.width,
    height: (r.height * frame.height) / v.height,
  };
}

export function acceptsTutorialEvent(
  event: TutorialMapEvent,
  requestId: number,
  lastSequence: number,
) {
  return (
    event.requestId === requestId &&
    (event.status !== "selected" ||
      (typeof event.vehicleId === "string" && event.vehicleId.length > 0)) &&
    ["target", "selected", "unavailable", "closed"].includes(event.status) &&
    (event.sequence === undefined
      ? event.status === "unavailable"
      : Number.isFinite(event.sequence) && event.sequence >= lastSequence)
  );
}
