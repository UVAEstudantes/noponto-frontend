import { acceptsTutorialEvent } from "./tutorialMapContract";
import type {
  TutorialMapEvent,
  TutorialMapRequest,
} from "./tutorialMapContract";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, usePathname } from "expo-router";
import { AccessibilityInfo, AppState, Keyboard } from "react-native";
import {
  radarSection,
  transportSearchStep,
  EMPTY,
  writeProgress,
  readProgress,
  transition,
  scheduleExample,
  type Step,
  chapterOf,
  unionTargets,
  linePanelStep,
} from "./tutorialSteps";
export type Rect = { x: number; y: number; width: number; height: number };
function useController() {
  const [step, setStep] = useState<Step>(null);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );

  const [replayRequested, setReplayRequested] = useState<Step>(null);
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [progress, setProgress] = useState({ ...EMPTY });
  const progressRef = useRef({ ...EMPTY });
  const [target, setTarget] = useState<Rect | null>(null);
  const [resultsTarget, setResultsTarget] = useState<Rect | null>(null);
  const [lineId, setLineId] = useState<string | null>(null);
  const [lineContext, setLineContextState] = useState<{
    lineId: string;
    lineName: string;
    modal: string;
    key: string;
    favorites?: boolean;
  } | null>(null);
  const [vehicleTarget, setVehicleTarget] = useState<Rect | null>(null);
  const [vehicleInfo, setVehicleInfo] = useState<TutorialMapEvent | null>(null);
  const [resumeVehicles, setResumeVehicles] = useState<2 | 3 | 4 | false>(
    false,
  );
  const [stopTarget, setStopTarget] = useState<Rect | null>(null);
  const [geometryVersion, setGeometryVersion] = useState(0);
  const invalidateTargets = useCallback(
    () => setGeometryVersion((value) => value + 1),
    [],
  );
  const [radarDraftPending, setRadarDraftPending] = useState(false);
  const [filterTarget, setFilterTarget] = useState<Rect | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const filterSelected = useCallback((id: string) => setSelectedFilter(id), []);
  const [radarHost, setRadarHost] = useState<"root" | "radar" | "stopPicker" | "confirmation">("root");
  const [radarTarget, setRadarTargetState] = useState<{step: Step; host: string; rect: Rect | null} | null>(null);
  const setRadarTarget = useCallback((rect: Rect | null) => setRadarTargetState({step, host: radarHost, rect}), [step, radarHost]);
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [lineTarget, setLineTargetState] = useState<{
    step: Step;
    modal: boolean;
    rect: Rect | null;
  } | null>(null);
  const setLineTarget = useCallback(
    (value: React.SetStateAction<Rect | null>) => {
      setLineTargetState((previous) => {
        const rect =
          typeof value === "function" ? value(previous?.rect ?? null) : value;
        return previous?.step === step &&
          previous.modal === lineModalOpen &&
          previous.rect === rect
          ? previous
          : { step, modal: lineModalOpen, rect };
      });
    },
    [step, lineModalOpen],
  );
  useEffect(() => {
    if (!linePanelStep(step) && step !== "lineTab") setLineTargetState(null);
  }, [step]);
  useEffect(() => {
    if (linePanelStep(step) && !lineContext) {
      setResumeVehicles(4);
      setStep("search");
    }
  }, [step, lineContext]);
  useEffect(() => { if (chapterOf(step) !== 5 || !step) { setRadarHost("root"); setRadarTargetState(null); } }, [step]);
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => sub.remove();
  }, []);
  const setLineContext = useCallback((value: typeof lineContext) => {
    setLineContextState((previous) =>
      previous?.key === value?.key ? previous : value,
    );
  }, []);
  const requestCounter = useRef(0);
  const mapRequest = useMemo<TutorialMapRequest | null>(() => {
    if (
      !foreground ||
      !lineContext ||
      !["vehicle", "vehicleDetails", "stop"].includes(step ?? "")
    )
      return null;
    return {
      requestId: ++requestCounter.current,
      lineId: lineContext.lineId,
      lineName: lineContext.lineName,
      modal: lineContext.modal,
      kind: step === "stop" ? "stop" : "vehicle",
      mode: step === "vehicleDetails" ? "details" : "marker",
      vehicleId: step === "vehicleDetails" ? vehicleInfo?.vehicleId : undefined,
      reducedMotion,
    };
  }, [
    step,
    lineContext,
    foreground,
    reducedMotion,
    step === "vehicleDetails" ? vehicleInfo?.vehicleId : null,
  ]);
  const requestRef = useRef(mapRequest);
  requestRef.current = mapRequest;
  const lastSequence = useRef(0);
  const measuredRequestId = useRef<number | null>(null);
  useEffect(() => {
    setVehicleTarget(null);
    lastSequence.current = 0;
  }, [mapRequest]);
  const onMapEvent = useCallback((event: TutorialMapEvent) => {
    if (
      !requestRef.current ||
      !acceptsTutorialEvent(
        event,
        requestRef.current.requestId,
        lastSequence.current,
      )
    )
      return;
    lastSequence.current = event.sequence ?? 0;
    if (event.status === "closed") {
      setVehicleTarget(null);
      setVehicleInfo(null);
      setStep(requestRef.current.kind === "stop" ? "stop" : "vehicle");
      return;
    }
    if (event.status === "unavailable") {
      setVehicleTarget(null);
      setStep(requestRef.current?.kind === "stop" ? "noStops" : "noVehicles");
      return;
    }
    setVehicleTarget(event.rect ?? null);
    if (event.rect) measuredRequestId.current = event.requestId;
    setVehicleInfo(event);
    if (event.status === "selected" && requestRef.current.mode === "marker")
      setStep(
        requestRef.current.kind === "stop" ? "stopDetails" : "vehicleDetails",
      );
  }, []);
  useEffect(() => {
    if (
      !foreground ||
      !["vehicle", "vehicleDetails", "stop", "stopDetails"].includes(step ?? "")
    )
      return;
    if (!lineContext) {
      setResumeVehicles(step === "stop" || step === "stopDetails" ? 3 : 2);
      setStep("search");
      return;
    }
    // A broken/reloading WebView must still offer a way forward.
    const deadline = setTimeout(() => {
      if (
        step === "stopDetails"
          ? !stopTarget
          : measuredRequestId.current !== mapRequest?.requestId
      )
        setStep(
          step === "stop" || step === "stopDetails" ? "noStops" : "noVehicles",
        );
    }, 6000);
    return () => clearTimeout(deadline);
  }, [step, lineContext, foreground, mapRequest, stopTarget]);
  useEffect(() => {
    if (step !== "stopDetails") setStopTarget(null);
  }, [step, lineContext]);
  const [example, setExample] = useState(false);
  const [activity, setActivity] = useState(0);
  const [searching, setSearching] = useState(false);
  const [routeAvailable, setRouteAvailable] = useState(false);
  const [exampleRequest, setExampleRequest] = useState(0);
  const pathname = usePathname();
  const writes = useRef(Promise.resolve());
  const save = useCallback((patch: Partial<typeof EMPTY>) => {
    progressRef.current = { ...progressRef.current, ...patch };
    setProgress(progressRef.current);
    const value = { ...progressRef.current };
    writes.current = writes.current
      .catch(() => {})
      .then(() => writeProgress(AsyncStorage, value));
  }, []);
  useEffect(() => {
    if (radarSection(step)) save({radarResume: step});
  }, [step, save]);
  useEffect(() => {
    let live = true;
    void readProgress(AsyncStorage).then((value) => {
      if (live) {
        progressRef.current = value;
        setProgress(value);
        setHydrated(true);
      }
    });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (ready && hydrated && !progressRef.current.seen) {
      save({ seen: true });
      setStep("welcome");
    }
  }, [ready, hydrated, save]);
  const end = useCallback(() => {
    save({ dismissed: true });
    setStep(null);
    setReplayRequested(null);
    setTarget(null);
    setResultsTarget(null);
    setVehicleTarget(null);
    setVehicleInfo(null);
    setStopTarget(null);
    setResumeVehicles(false);
    setSearching(false);
    setLineTargetState(null);
    setLineModalOpen(false);
    setFilterTarget(null);
    Keyboard.dismiss();
  }, [save]);
  useEffect(() => {
    if (
      step &&
      pathname !== "/" &&
      !(step === "lineTab" && pathname === "/linhas")
    )
      end();
  }, [pathname, step, end]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (value) =>
      setForeground(value === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (step !== "search" || !foreground || example) return;
    return scheduleExample(() => setExample(true));
  }, [step, foreground, activity, example]);
  const interact = useCallback(() => setActivity((v) => v + 1), []);
  const finishChapter = useCallback(
    (id: number) => {
      save({
        chapters: [...new Set([...(progressRef.current.chapters ?? []), id])],
        ...(id === 1 ? { completed: true } : {}),
      });
    },
    [save],
  );
  const advance = useCallback(
    (event: "next" | "back" | "selected" | "skip" | "demo") => {
      if (event !== "selected" && !transportSearchStep(step)) Keyboard.dismiss();
      if (event === "next" && step === "radarChapterDone" && radarDraftPending) { setStep("voiceSave"); return; }
      if (event === "skip" && step) save({skippedSteps: [...new Set([...(progressRef.current.skippedSteps ?? []), step])]});
      if (event === "skip" && step === "search" && resumeVehicles) {
        setResumeVehicles(false);
        setStep(
          resumeVehicles === 4
            ? "lineTab"
            : resumeVehicles === 3
              ? "noStops"
              : "noVehicles",
        );
        return;
      }
      if (event === "selected" && step === "search" && resumeVehicles) {
        setResumeVehicles(false);
        setStep(
          resumeVehicles === 4
            ? "linesIntro"
            : resumeVehicles === 3
              ? "stopsIntro"
              : "vehiclesIntro",
        );
        return;
      }
      const next = transition(step, event);
      if (next === "done") finishChapter(1);
      if (next === "vehiclesDone" && !(step === "vehiclesIntro" && event === "skip")) finishChapter(2);
      if (next === "stopsDone") finishChapter(3);
      if (next === "linesDone") finishChapter(4);
      if (next === "journeyDone" && event !== "back") finishChapter(6);
      const section = radarSection(step);
      if (event !== "back" && section && (section !== radarSection(next) || next === "radarChapterDone")) {
        const sections = [...new Set([...(progressRef.current.radarSections ?? []), section])];
        save({radarSections: sections});
        if (["5A", "5B", "5C"].every(id => sections.includes(id))) finishChapter(5);
      }

      if (step === "lineTab" && pathname === "/linhas") {
        setReplayRequested(next);
        router.navigate("/");
        return;
      }
      setStep(next);
    },
    [step, resumeVehicles, finishChapter, pathname, save, radarDraftPending],
  );
  const start = useCallback(() => {
    router.navigate("/");
    setTarget(null);
    setExample(false);
    setActivity((v) => v + 1);
    setStep("search");
  }, []);
  const replay = useCallback((chapter?: 1 | 2 | 3 | 4 | 5 | 6, section?: "5A" | "5B" | "5C") => {
    setStep(null);
    setTarget(null);
    setSearching(false);
    setLineTargetState(null);
    setLineModalOpen(false);
    setResumeVehicles(false);
    save({manualReplays: (progressRef.current.manualReplays ?? 0) + 1});
    setReplayRequested(
      chapter === 6 ? "transportIntro" : chapter === 5 ? (section === "5A" ? "radarIntro" : section === "5B" ? "notificationIntro" : section === "5C" ? "voiceIntro" : (progressRef.current.chapters?.includes(5) ? "radarIntro" : progressRef.current.radarResume ?? "radarIntro")) : chapter === 1
        ? "search"
        : chapter === 2
          ? "vehiclesIntro"
          : chapter === 3
            ? "stopsIntro"
            : chapter === 4
              ? "linesIntro"
              : "welcome",
    );
    router.navigate("/");
  }, [save]);
  useEffect(() => {
    if (replayRequested && pathname === "/") {
      setStep(replayRequested);
      setReplayRequested(null);
    }
  }, [replayRequested, pathname]);
  const stopSelected = useCallback(
    () => setStep((current) => transition(current, "stopSelected")),
    [],
  );
  const stopClosed = useCallback(() => {
    setStopTarget(null);
    setStep((current) => (current === "stopDetails" ? "stop" : current));
  }, []);
  const complete = useCallback(() => {
      if (step === "journeyDone") save({presentationFinished: true, ...([1,2,3,4,5,6].every(id => progressRef.current.chapters?.includes(id)) ? {journeyFinished: true} : {})});
      setFilterTarget(null);
      setStep(null);
      setVehicleInfo(null);
      setTarget(null);
      setResultsTarget(null);
      setVehicleTarget(null);
      setStopTarget(null);
      setResumeVehicles(false);
      setSearching(false);
      setLineTargetState(null);
      setLineModalOpen(false);
  }, [step, save]);
  return {
    radarDraftPending, setRadarDraftPending,
    filterTarget, setFilterTarget, selectedFilter,
    filterSelected,
    openTutorials: () => { complete(); router.navigate("/configuracao"); },
    radarHost, setRadarHost, setRadarTarget,
    reducedMotion,
    geometryVersion,
    invalidateTargets,
    lineModalOpen,
    lineFavoritesView: lineContext?.favorites === true,
    setLineModalOpen,
    setLineTarget,
    inLines: pathname === "/linhas",
    openLines: () => router.navigate("/linhas"),
    setStopTarget,
    stopSelected,
    stopClosed,
    chapter: chapterOf(step),
    lineId,
    setLineId,
    setLineContext,
    lineContext,
    resultsTarget,
    setResultsTarget,
    mapRequest,
    onMapEvent,
    vehicleInfo,
    spotlight:
      transportSearchStep(step) ? filterTarget : step === "transportMap" ? target : chapterOf(step) === 5 ? (radarTarget?.step === step && radarTarget.host === radarHost ? radarTarget.rect : null) : linePanelStep(step) || step === "lineTab"
        ? lineTarget?.step === step && lineTarget.modal === lineModalOpen
          ? lineTarget.rect
          : null
        : step === "stopDetails"
          ? stopTarget
          : step === "search"
            ? unionTargets(target, resultsTarget)
            : mapRequest && vehicleInfo?.requestId === mapRequest.requestId
              ? vehicleTarget
              : null,
    progress,
    searching,
    setSearching,
    routeAvailable,
    setRouteAvailable,
    replay,
    step,
    ready,
    setReady,
    target,
    setTarget,
    example,
    exampleRequest,
    interact,
    advance,
    start,
    end,
    useExample: () => {
      setExampleRequest((v) => v + 1);
      interact();
    },
    complete,
  };
}
const Context = createContext<ReturnType<typeof useController> | null>(null);
export function TutorialProvider({ children }: React.PropsWithChildren) {
  const value = useController();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTutorial() {
  const value = useContext(Context);
  if (!value) throw new Error("TutorialProvider ausente");
  return value;
}
