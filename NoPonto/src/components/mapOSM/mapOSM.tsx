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
} from "react";
import { WebView } from "react-native-webview";
import { MapaOSMProps, MapaOSMRef } from "./types";
import { buildMapHtml } from "./webview/mapHtml";

// IDs de estilo/filtros serializados para consumo dentro do script da WebView.
const estilosJS = estilosMapaDisponiveis.map((e) => `"${e.id}"`).join(", ");

const filtrosMapaJS = estilosMapaDisponiveis
  .map((e) => `"${e.id}":{light:"${e.filtroLight}",dark:"${e.filtroDark}"}`)
  .join(",");

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
      linhasParaMostrar,
      darkMode = false,
      showTraffic = false,
      estiloMapa = ESTILO_MAPA_PADRAO,
      onStopPress,
    },
    ref,
  ) => {
    const webViewRef = useRef<WebView>(null);

    // Guardamos apenas a primeira coordenada válida para impedir "salto" inicial do mapa quando localização vai refinando nos primeiros segundos do GPS.
    const coordInicialRef = useRef<{ latitude: number; longitude: number } | null>(
      null,
    );

    if (!coordInicialRef.current && location?.coords) {
      coordInicialRef.current = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    }

    const latInicial =
      coordInicialRef.current?.latitude ?? location?.coords?.latitude ?? -22.9068;
    const lngInicial =
      coordInicialRef.current?.longitude ?? location?.coords?.longitude ?? -43.1729;

    useImperativeHandle(ref, () => ({
      centerOnUser: () => {
        injectWebViewCommand(webViewRef, `if(window.centerOnUser) window.centerOnUser();`);
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
        injectWebViewCommand(webViewRef, `if(window.limparConexaoPoi) window.limparConexaoPoi();`);
      },
    }));

    // Só enviamos updates após a confirmação "map_ready" vinda da WebView.
    const [mapReady, setMapReady] = React.useState(false);

    // Update "pesado": linhas/tema/tráfego/estilo. Mantido separado do update de usuário.
    useEffect(() => {
      if (!mapReady) return;

      const data = {
        userLocation: location?.coords
          ? [location.coords.latitude, location.coords.longitude]
          : null,
        heading: location?.coords?.heading ?? null,
        accuracy: location?.coords?.accuracy ?? null,
        linhas: linhasParaMostrar,
        darkMode,
        showTraffic,
        estiloMapa,
      };

      injectWebViewCommand(webViewRef, `window.updateMap(${JSON.stringify(data)});`);

      // Full map updates are heavy; user movement is handled separately.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, linhasParaMostrar, darkMode, showTraffic, estiloMapa]);

    // Update "leve" e frequente: posição do usuário + heading/acurácia.
    useEffect(() => {
      if (!mapReady || !location?.coords) return;

      const data = {
        userLocation: [location.coords.latitude, location.coords.longitude],
        heading: location.coords.heading ?? null,
        accuracy: location.coords.accuracy ?? null,
      };

      injectWebViewCommand(webViewRef, `if(window.updateUser) window.updateUser(${JSON.stringify(data)});`);
    }, [mapReady, location]);

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

    return (
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: mapHTML }}
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
            setMapReady(true);
            return;
          }
          try {
            const payload = JSON.parse(raw);
            if (payload?.type === "stop_click" && payload.parada) {
              onStopPress?.(payload.parada);
            }
          } catch {
            // Ignora mensagens não-JSON para manter tolerância com logs/strings soltas.
          }
        }}
      />
    );
  },
);

MapaOSM.displayName = "MapaOSM";

export default MapaOSM;
