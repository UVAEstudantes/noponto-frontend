import { mapTutorialRect } from '../tutorial/tutorialMapContract';
import {
  ESTILO_MAPA_PADRAO,
  estilosMapaDisponiveis,
} from "@/src/constants/estilosMapa";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { MapaOSMProps, MapaOSMRef } from "./types";
import { buildMapHtml } from "./webview/mapHtml";
import { useUnifiedLocation } from '@/src/services/unifiedLocation';
import { createHybridComposer } from '@/src/services/hybridContext';
import {GPS_POLICY} from '@/src/services/gpsPresentationPolicy';
import { adaptarRailParaMapa } from "@/src/services/veiculosMapa";
import { useIndicadores } from "@/src/context/ProvedorIndicadores";
import { estilosEfetivos } from "@/src/constants/indicadores";
import { roadPresenceWebViewProbe, traceRoadNativePayload, traceRoadWebViewResult } from '@/src/services/roadPresenceDiagnostics';

// IDs de estilo/filtros serializados para consumo dentro do script da WebView.
const estilosJS = estilosMapaDisponiveis.map((e) => `"${e.id}"`).join(", ");

const filtrosMapaJS = estilosMapaDisponiveis
  .map((e) => `"${e.id}":{light:"${e.filtroLight}",dark:"${e.filtroDark}"}`)
  .join(",");
const EMPTY_RAIL:NonNullable<MapaOSMProps['railVehicles']>=[];
const EMPTY_PHYSICAL:NonNullable<MapaOSMProps['physicalVehicles']>=[];
function publicPosition(p:NonNullable<MapaOSMProps['linhasParaMostrar'][number]['posicoes']>[number]){
  const {terminalPresence,presencaIdadeSegundos,...publicFields}=p;void terminalPresence;void presencaIdadeSegundos;
  return publicFields;
}

// Wrapper único para comandos JS injetados no runtime do MapLibre.
function injectWebViewCommand(
  webViewRef: React.RefObject<WebView | null>,
  script: string,
) {
  webViewRef.current?.injectJavaScript(script);
}

const MapaOSM = forwardRef<MapaOSMRef, MapaOSMProps>(
  (
    {
      location,
      tutorialRequest,
      onTutorialEvent,
      linhasParaMostrar: legacyLines,
      darkMode = false,
      showTraffic = false,
      estiloMapa = ESTILO_MAPA_PADRAO,
      onStopPress,
      railVehicles = EMPTY_RAIL,
      physicalVehicles = EMPTY_PHYSICAL,
      onReady,
      onTerminalVehiclesChange,
    },
    ref,
  ) => {
    const unified = useUnifiedLocation(legacyLines.filter(l => l.modal === 'onibus').map(l => l.nome));
    const hybridComposer = useRef(createHybridComposer());
    const [contextBoundary,setContextBoundary]=useState(0);
    const linhasParaMostrar = useMemo(() => hybridComposer.current(legacyLines, unified.snapshots, Math.max(unified.now,contextBoundary)), [legacyLines, unified.snapshots, unified.now,contextBoundary]);
    const terminalEvidence=useMemo(()=>linhasParaMostrar.flatMap(l=>(l.posicoes??[]).flatMap(p=>p.terminalPresence?[p.terminalPresence]:[])),[linhasParaMostrar]);
    const lastTerminalEvidence=useRef<typeof terminalEvidence|null>(null);
    useEffect(()=>{
      const old=lastTerminalEvidence.current;
      const equal=old&&old.length===terminalEvidence.length&&old.every((v,i)=>{
        const n=terminalEvidence[i];return v.key===n.key&&v.physicalAt===n.physicalAt&&v.state===n.state&&v.knownPattern===n.knownPattern&&v.operationalConfirmed===n.operationalConfirmed&&v.validUntil===n.validUntil&&v.terminalName===n.terminalName&&v.corridors.length===n.corridors.length&&v.corridors.every((c,j)=>c===n.corridors[j]);
      });
      if(equal)return;
      lastTerminalEvidence.current=terminalEvidence;onTerminalVehiclesChange?.(terminalEvidence);
    },[terminalEvidence,onTerminalVehiclesChange]);
    useEffect(()=>()=>onTerminalVehiclesChange?.([]),[onTerminalVehiclesChange]);
    useEffect(()=>{
      const now=Date.now();const times=linhasParaMostrar.flatMap(l=>(l.posicoes??[]).flatMap(p=>[(p.contextValidatedAt??0)+GPS_POLICY.contextMs,(p.speedObservedAt??0)+GPS_POLICY.publicMs+1])).filter(t=>t>now);
      if(!times.length)return;
      const timer=setTimeout(()=>setContextBoundary(Date.now()),Math.min(...times)-now+1);
      return ()=>clearTimeout(timer);
    },[linhasParaMostrar]);
    const webViewRef = useRef<WebView>(null);
    const nativeFrameRef = useRef<View>(null);
    const { preferencias } = useIndicadores();
    const estilosVeiculos = useMemo(() => estilosEfetivos(preferencias), [preferencias]);
    const diagnosticsRef = useRef({ fullUpdates: 0, realtimeUpdates: 0, fullChars: 0, realtimeChars: 0 });
    const railVehiclesForMap = useMemo(
      () => railVehicles.map(adaptarRailParaMapa),
      [railVehicles],
    );
    const structureSignature = linhasParaMostrar.map((linha) => linha.structureKey
      ?? `${linha.nome}:${linha.cor}:${linha.modoSentido}:${linha.mostrarParadas}`).join("|");
    const structuralCacheRef = useRef<{ signature: string; linhas: typeof linhasParaMostrar }>({
      signature: "", linhas: [],
    });
    if (structuralCacheRef.current.signature !== structureSignature) {
      if (__DEV__) console.log("[MapaEstrutural]", {
        anterior: structuralCacheRef.current.signature,
        atual: structureSignature,
        linhas: linhasParaMostrar.map((linha) => linha.structureKey ?? linha.nome),
      });
      structuralCacheRef.current = {
        signature: structureSignature,
        linhas: linhasParaMostrar.map((linha) => ({ ...linha, posicoes: [] })),
      };
    }
    const realtimeLines = useMemo(() => linhasParaMostrar.map((linha) => ({
      structureKey: linha.structureKey, nome: linha.nome, modal: linha.modal,
      posicoes: (linha.posicoes ?? []).map(publicPosition),
    })), [linhasParaMostrar]);

    useEffect(() => {
      const diagnostics = diagnosticsRef.current;
      if (__DEV__) console.log("[MapaOSM] mount");
      return () => {
        if (__DEV__) console.log("[MapaOSM] unmount", diagnostics);
      };
    }, []);

    // Âncora imutável por montagem: GPS tardio entra por updateUser, sem recarregar o HTML.
    const coordInicialRef = useRef({
      latitude: location?.coords?.latitude ?? -22.9068,
      longitude: location?.coords?.longitude ?? -43.1729,
    });
    const latInicial = coordInicialRef.current.latitude;
    const lngInicial = coordInicialRef.current.longitude;

    useImperativeHandle(ref, () => ({
      centerOnUser: () => {
        injectWebViewCommand(
          webViewRef,
          `if(window.centerOnUser) window.centerOnUser();`,
        );
      },
      fitToCoordinates: (coordinates) => {
        injectWebViewCommand(
          webViewRef,
          `if(window.fitToCoordinates) window.fitToCoordinates(${JSON.stringify(coordinates)});`,
        );
      },
      focarVeiculo: (payload) => {
        injectWebViewCommand(
          webViewRef,
          `if(window.focusOnVehicle) window.focusOnVehicle(${JSON.stringify(payload)});`,
        );
      },
      mostrarPoi: (payload) => {
        injectWebViewCommand(
          webViewRef,
          `if(window.mostrarConexaoPoi) window.mostrarConexaoPoi(${JSON.stringify(payload)});`,
        );
      },
      limparPoi: () => {
        injectWebViewCommand(
          webViewRef,
          `if(window.limparConexaoPoi) window.limparConexaoPoi();`,
        );
      },
    }));

    // Só enviamos updates após a confirmação "map_ready" vinda da WebView.
    const [mapReady, setMapReady] = React.useState(false);
    const [mapGeneration, setMapGeneration] = React.useState(0);

    const lastIndicatorMessage=useRef('');
    useEffect(() => {
      if (!mapReady) return;
      const serialized=JSON.stringify(estilosVeiculos),key=`${mapGeneration}|${serialized}`;
      if(lastIndicatorMessage.current===key)return;
      lastIndicatorMessage.current=key;
      injectWebViewCommand(webViewRef,
        `if(window.updateIndicatorStyles) window.updateIndicatorStyles(${serialized});`);
    }, [mapReady, mapGeneration, estilosVeiculos]);

    // Update "pesado": linhas/tema/tráfego/estilo. Mantido separado do update de usuário.
    useEffect(() => {
      if (!mapReady) return;

      const data = {
        userLocation: location?.coords
          ? [location.coords.latitude, location.coords.longitude]
          : null,
        heading: location?.coords?.heading ?? null,
        accuracy: location?.coords?.accuracy ?? null,
        // Hydrating geometry/theme must not send a transient empty GPS snapshot.
        linhas: structuralCacheRef.current.linhas.map((linha) => ({
          ...linha,
          posicoes: (linhasParaMostrar.find((atual) => atual.nome === linha.nome
            && atual.modal === linha.modal && atual.linhaId === linha.linhaId)?.posicoes ?? []).map(publicPosition),
        })),
        darkMode,
        showTraffic,
        estiloMapa,
        railVehicles: [],
        movementDiagnostics: false,
        unifiedCodes: unified.snapshots.filter(s => s.enabled).map(s => s.lineCode),
      };
      const serialized = JSON.stringify(data);
      diagnosticsRef.current.fullUpdates++;
      diagnosticsRef.current.fullChars += serialized.length;
      injectWebViewCommand(
        webViewRef,
        `window.updateMap(${serialized});`,
      );

      // Full map updates are heavy; user movement is handled separately.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      mapReady,
      mapGeneration,
      structureSignature,
      darkMode,
      showTraffic,
      estiloMapa,
    ]);

    const lastRealtimeMessage=useRef('');
    useEffect(() => {
      traceRoadNativePayload(realtimeLines,mapReady);
      if (!mapReady) return;
      const data = { linhas: realtimeLines, railVehicles: railVehiclesForMap, unifiedCodes: unified.snapshots.filter(s => s.enabled).map(s => s.lineCode) };
      const serialized = JSON.stringify(data);
      const signature=`${mapGeneration}|${serialized}`;
      if(lastRealtimeMessage.current===signature)return;
      lastRealtimeMessage.current=signature;
      diagnosticsRef.current.realtimeUpdates++;
      diagnosticsRef.current.realtimeChars += serialized.length;
      if (__DEV__ && diagnosticsRef.current.realtimeUpdates % 25 === 0) {
        console.log("[MapaOSM] métricas", diagnosticsRef.current);
      }
      injectWebViewCommand(webViewRef,
        `if(window.updateRealtime) window.updateRealtime(${serialized});`);
      const probe=roadPresenceWebViewProbe();
      if(probe)injectWebViewCommand(webViewRef,probe);
    }, [mapReady, mapGeneration, realtimeLines, railVehiclesForMap,unified.snapshots]);

    useEffect(() => {
      if (!mapReady) return;
      injectWebViewCommand(webViewRef,
        `if(window.updatePhysicalPresence) window.updatePhysicalPresence(${JSON.stringify(physicalVehicles)});`);
    }, [mapReady, mapGeneration, physicalVehicles]);

    // Update "leve" e frequente: posição do usuário + heading/acurácia.
    useEffect(() => {
      if (!mapReady || !location?.coords) return;

      const data = {
        userLocation: [location.coords.latitude, location.coords.longitude],
        heading: location.coords.heading ?? null,
        accuracy: location.coords.accuracy ?? null,
      };

      injectWebViewCommand(
        webViewRef,
        `if(window.updateUser) window.updateUser(${JSON.stringify(data)});`,
      );
    }, [mapReady, mapGeneration, location]);

    const latestTutorialMeasurement = useRef<object | null>(null);
    const activeTutorialRequest = useRef(tutorialRequest);
    activeTutorialRequest.current = tutorialRequest;
    useEffect(() => {
      if (!mapReady) return;
      injectWebViewCommand(webViewRef, `if(window.setTutorialVehicle) window.setTutorialVehicle(${JSON.stringify(tutorialRequest ?? null)});true;`);
    }, [mapReady, mapGeneration, tutorialRequest]);
    useEffect(() => () => injectWebViewCommand(webViewRef, 'if(window.setTutorialVehicle) window.setTutorialVehicle(null);true;'), []);

    // HTML final memoizado: só recria quando a âncora inicial muda.
    const mapHTML = useMemo(
      () =>
        buildMapHtml({
          latInicial,
          lngInicial,
          estilosJS,
          filtrosMapaJS,
          estiloMapaPadrao: ESTILO_MAPA_PADRAO,
        }),
      [latInicial, lngInicial],
    );

    const source = useMemo(() => ({ html: mapHTML }), [mapHTML]);

    return (
      <View ref={nativeFrameRef} collapsable={false} style={{ flex: 1 }}>
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={source}
        onLoadStart={() => { latestTutorialMeasurement.current = null; setMapReady(false); if (tutorialRequest) onTutorialEvent?.({ type: 'tutorial_vehicle', requestId: tutorialRequest.requestId, status: 'unavailable' }); }}
        style={{ flex: 1, backgroundColor: darkMode ? "#1a1a1a" : "#f0f0f0" }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onLoadEnd={() => {
          // resize explícito evita canvas descalibrado em mounts com layout assíncrono.
          injectWebViewCommand(webViewRef, `if(map) map.resize();`);
        }}
        onMessage={(event) => {
          const raw = event.nativeEvent.data;
          if (raw === "map_ready") {
            setMapGeneration((geracao) => geracao + 1);
            setMapReady(true);
            onReady?.();
            return;
          }
          try {
            const payload = JSON.parse(raw);
            if (payload?.type === 'tutorial_vehicle' && activeTutorialRequest.current?.requestId === payload.requestId) {
              const requestId = payload.requestId;
              const measurement = {};
              latestTutorialMeasurement.current = measurement;
              if (activeTutorialRequest.current?.nativeHighlight) {
                onTutorialEvent?.({ ...payload, rect: undefined, viewport: undefined });
                return;
              }
              nativeFrameRef.current?.measureInWindow((x, y, width, height) => {
                if (activeTutorialRequest.current?.requestId !== requestId || latestTutorialMeasurement.current !== measurement) return;
                const rect = mapTutorialRect(payload, requestId, { x, y, width, height });
                onTutorialEvent?.({ ...payload, rect: rect ?? undefined, viewport: undefined });
              });
              return;
            }
            if (payload?.type === "stop_click" && payload.parada) {
              onStopPress?.(payload.parada);
            }
            if (__DEV__ && payload?.type === "realtime_metrics") {
              console.log("[MapaRealtime]", payload.metrics);
            }
            if (__DEV__ && payload?.type === "movement_metrics") {
              console.log("[MapaMovimento]", payload.metrics);
            }
            if (__DEV__ && payload?.type === 'unified_location_applied') {
              const diagnostic = globalThis as typeof globalThis & { __nopontoUnifiedEvidence?: unknown[] };
              diagnostic.__nopontoUnifiedEvidence = [...(diagnostic.__nopontoUnifiedEvidence ?? []).slice(-19), payload];
            }
            if (__DEV__ && payload?.type === 'road_presence_trace_map') traceRoadWebViewResult(payload);
          } catch {
            // Ignora mensagens não-JSON para manter tolerância com logs/strings soltas.
          }
        }}
      />
      </View>
    );
  },
);

MapaOSM.displayName = "MapaOSM";

export default MapaOSM;
