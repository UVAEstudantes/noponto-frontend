import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import {
  ESTILO_MAPA_PADRAO,
  EstiloMapaId,
  estilosMapaDisponiveis,
} from "@/src/constants/estilosMapa";
import { WebView } from "react-native-webview";

interface MapaOSMProps {
  location: any;
  linhasParaMostrar: {
    nome: string;
    cor?: string;
    modal?: string;
    coordenadas?: [number, number][];
    segmentos?: [number, number][][];
    posicoes?: {
      id?: string;
      codigo?: string;
      ordem?: string;
      latitude?: number | string;
      longitude?: number | string;
      lat?: number | string;
      lng?: number | string;
      direcao?: number | string | null;
      velocidade?: number | string;
      sentido?: string;
      sentidoNome?: string;
      trajeto?: string;
      timestamp?: number | string;
    }[];
  }[];
  darkMode?: boolean;
  showTraffic?: boolean;
  estiloMapa?: EstiloMapaId;
}

export interface MapaOSMRef {
  centerOnUser: () => void;
  fitToCoordinates: (
    coordinates: { latitude: number; longitude: number }[],
  ) => void;
}

const classesEstiloMapa = estilosMapaDisponiveis
  .map((estilo) => `estilo-${estilo.id}`)
  .join(" ");

const filtrosEstiloMapaCSS = estilosMapaDisponiveis
  .map(
    (estilo) => `
          #map.light-mode.estilo-${estilo.id} .leaflet-tile {
            filter: ${estilo.filtroLight};
          }

          #map.dark-mode.estilo-${estilo.id} .leaflet-tile {
            filter: ${estilo.filtroDark};
          }
    `,
  )
  .join("\n");

const estilosMapaJS = estilosMapaDisponiveis
  .map((estilo) => `"${estilo.id}"`)
  .join(", ");

const MapaOSM = forwardRef<MapaOSMRef, MapaOSMProps>(
  (
    {
      location,
      linhasParaMostrar,
      darkMode = false,
      showTraffic = false,
      estiloMapa = ESTILO_MAPA_PADRAO,
    },
    ref,
  ) => {
    const webViewRef = useRef<WebView>(null);
    const coordenadasIniciaisRef = useRef<{
      latitude: number;
      longitude: number;
    } | null>(null);

    if (!coordenadasIniciaisRef.current && location?.coords) {
      coordenadasIniciaisRef.current = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    }

    const latitudeInicial =
      coordenadasIniciaisRef.current?.latitude ??
      location?.coords?.latitude ??
      -22.9068;

    const longitudeInicial =
      coordenadasIniciaisRef.current?.longitude ??
      location?.coords?.longitude ??
      -43.1729;

    useImperativeHandle(ref, () => ({
      centerOnUser: () => {
        webViewRef.current?.injectJavaScript(
          `if(window.centerOnUser) window.centerOnUser();`,
        );
      },
      fitToCoordinates: (
        coordinates: { latitude: number; longitude: number }[],
      ) => {
        const injectJS = `if(window.fitToCoordinates) window.fitToCoordinates(${JSON.stringify(coordinates)});`;
        webViewRef.current?.injectJavaScript(injectJS);
      },
    }));

    const [mapReady, setMapReady] = React.useState(false);

    useEffect(() => {
      if (!mapReady || !location?.coords) return;

      const data = {
        userLocation: [location.coords.latitude, location.coords.longitude],
        heading: location.coords.heading,
        linhas: linhasParaMostrar,
        darkMode: darkMode,
        showTraffic: showTraffic,
        estiloMapa: estiloMapa,
      };

      webViewRef.current?.injectJavaScript(`
          window.updateMap(${JSON.stringify(data)});
        `);
    }, [
      mapReady,
      location,
      linhasParaMostrar,
      darkMode,
      showTraffic,
      estiloMapa,
    ]);

    // Mantemos o HTML estável para evitar recarregar o WebView ao alternar tema.
    const mapHTML = useMemo(
      () => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body { height: 100%; width: 100%; margin: 0; padding: 0; background-color: #f0f0f0; }
          #map { height: 100%; width: 100%; position: absolute; top: 0; left: 0; }

          .leaflet-tile {
            transition: filter 0.25s ease;
          }

          ${filtrosEstiloMapaCSS}
          
          .user-container { 
            display: flex; 
            align-items: center; 
            justify-content: center; 
          }

          .user-dot { 
            width: 12px; 
            height: 12px; 
            background: #4FC3F7; 
            border: 2.5px solid white; 
            border-radius: 50%; 
            box-shadow: 0 0 6px rgba(0,0,0,0.4); 
            z-index: 2;
          }

          .user-arrow { 
            position: absolute; 
            width: 0; 
            height: 0; 

            border-left: 6px solid transparent; 
            border-right: 6px solid transparent; 
            border-bottom: 6px solid #4FC3F7; 
            
            top: -7px; /* Mais próxima da bolinha devido à altura menor */
            
            /* Ponto de rotação ajustado para o centro da bolinha (6px da seta + 6px de folga) */
            transform-origin: 50% 12px; 
            transition: transform 0.2s ease-out;
          }

          .leaflet-marker-icon.bus-marker {
            background: transparent;
            border: none;
          }

          .bus-marker-inner {
            position: relative;
            width: 22px;
            height: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .bus-blob { 
            width: 16px; 
            height: 16px; 
            border-radius: 50%; 
            border: 2px solid white; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.3); 
          }

          .bus-arrow {
            position: absolute;
            left: 50%;
            top: 50%;
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-bottom: 8px solid rgba(255,255,255,0.95);
            transform: translate(-50%, -50%) rotate(var(--heading, 0deg)) translateY(-11px);
            transform-origin: 50% 50%;
            transition: transform 0.45s linear;
            pointer-events: none;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map, tiles, trafficTiles, userMarker, linesLayer, vehiclesLayer;
          var estilosMapaDisponiveis = [${estilosMapaJS}];
          var classesEstiloMapa = "${classesEstiloMapa}";
          var vehicleMarkers = {};
          var vehicleAnimationFrames = {};
          var vehicleHeadings = {};
          var autoFollow = true;
          var internalMove = false;

          function runInternalMove(callback) {
            internalMove = true;
            callback();
          }

          function parseMaybeNumber(value) {
            if (typeof value === 'number') {
              return Number.isFinite(value) ? value : null;
            }

            if (typeof value === 'string') {
              var normalized = value.replace(',', '.').trim();
              if (!normalized) {
                return null;
              }

              var parsed = Number(normalized);
              return Number.isFinite(parsed) ? parsed : null;
            }

            return null;
          }

          function normalizeHeading(value) {
            var heading = parseMaybeNumber(value);

            if (heading === null) {
              return null;
            }

            var normalized = heading % 360;
            return normalized < 0 ? normalized + 360 : normalized;
          }

          function calculateHeading(fromLatLng, toLatLng) {
            if (!fromLatLng || !toLatLng) {
              return null;
            }

            var latDiff = Math.abs(fromLatLng.lat - toLatLng.lat);
            var lngDiff = Math.abs(fromLatLng.lng - toLatLng.lng);
            if (latDiff < 0.00001 && lngDiff < 0.00001) {
              return null;
            }

            var lat1 = fromLatLng.lat * Math.PI / 180;
            var lat2 = toLatLng.lat * Math.PI / 180;
            var deltaLng = (toLatLng.lng - fromLatLng.lng) * Math.PI / 180;

            var y = Math.sin(deltaLng) * Math.cos(lat2);
            var x =
              Math.cos(lat1) * Math.sin(lat2) -
              Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

            var bearing = Math.atan2(y, x) * 180 / Math.PI;
            return (bearing + 360) % 360;
          }

          function stopVehicleAnimation(vehicleKey) {
            if (vehicleAnimationFrames[vehicleKey]) {
              cancelAnimationFrame(vehicleAnimationFrames[vehicleKey]);
              delete vehicleAnimationFrames[vehicleKey];
            }
          }

          function animateVehicleTo(vehicleKey, marker, destination, durationMs) {
            stopVehicleAnimation(vehicleKey);

            var start = marker.getLatLng();
            if (start.distanceTo(destination) < 0.8) {
              marker.setLatLng(destination);
              return;
            }

            var startedAt = performance.now();

            function step(timestamp) {
              var progress = Math.min((timestamp - startedAt) / durationMs, 1);
              var nextLat = start.lat + (destination.lat - start.lat) * progress;
              var nextLng = start.lng + (destination.lng - start.lng) * progress;

              marker.setLatLng([nextLat, nextLng]);

              if (progress < 1) {
                vehicleAnimationFrames[vehicleKey] = requestAnimationFrame(step);
              } else {
                delete vehicleAnimationFrames[vehicleKey];
              }
            }

            vehicleAnimationFrames[vehicleKey] = requestAnimationFrame(step);
          }

          function createVehicleIcon(color, heading) {
            var safeColor = color || '#333333';
            var safeHeading = typeof heading === 'number' ? heading : 0;

            return L.divIcon({
              className: 'bus-marker',
              html:
                '<div class="bus-marker-inner" style="--heading:' + safeHeading + 'deg">' +
                  '<div class="bus-blob" style="background-color:' + safeColor + '"></div>' +
                  '<div class="bus-arrow"></div>' +
                '</div>',
              iconSize: [22, 22],
              iconAnchor: [11, 11]
            });
          }

          function formatTimestamp(value) {
            var timestamp = parseMaybeNumber(value);
            if (timestamp === null) {
              return '';
            }

            // Alguns endpoints podem vir em segundos; converte para ms quando necessario.
            if (timestamp < 1000000000000) {
              timestamp = timestamp * 1000;
            }

            var date = new Date(timestamp);
            if (Number.isNaN(date.getTime())) {
              return '';
            }

            return date.toLocaleString('pt-BR');
          }

          function buildVehiclePopup(linha, p, vehicleId, heading) {
            var popupInfo = '<b>' + (linha.nome || 'Transporte') + '</b>';
            popupInfo += '<br/>ID: ' + vehicleId;
            popupInfo += '<br/>Modal: ' + (linha.modal || '-');

            var sentidoExibicao = p.sentidoNome || p.sentido;
            if (sentidoExibicao) {
              popupInfo += '<br/>Sentido: ' + sentidoExibicao;
            }

            if (typeof heading === 'number') {
              popupInfo += '<br/>Direcao: ' + Math.round(heading) + '&deg;';
            }

            if (p.velocidade !== undefined && p.velocidade !== null) {
              popupInfo += '<br/>Velocidade: ' + p.velocidade + ' km/h';
            }

            if (p.trajeto) {
              popupInfo += '<br/>Trajeto: ' + p.trajeto;
            }

            var atualizadoEm = formatTimestamp(p.timestamp);
            if (atualizadoEm) {
              popupInfo += '<br/>Atualizado: ' + atualizadoEm;
            }

            return popupInfo;
          }

          function setVehicleHeading(marker, heading) {
            if (typeof heading !== 'number') {
              return;
            }

            var markerElement = marker.getElement();
            if (!markerElement) {
              return;
            }

            var markerInner = markerElement.querySelector('.bus-marker-inner');
            if (!markerInner) {
              return;
            }

            markerInner.style.setProperty('--heading', heading + 'deg');
          }

          function normalizarEstiloMapa(estiloId) {
            if (typeof estiloId !== 'string') {
              return '${ESTILO_MAPA_PADRAO}';
            }

            return estilosMapaDisponiveis.indexOf(estiloId) >= 0
              ? estiloId
              : '${ESTILO_MAPA_PADRAO}';
          }

          function setMapStyle(estiloId) {
            var mapEl = document.getElementById('map');

            if (!mapEl) {
              return;
            }

            classesEstiloMapa.split(' ').forEach(function(classe) {
              if (classe) {
                mapEl.classList.remove(classe);
              }
            });

            mapEl.classList.add('estilo-' + normalizarEstiloMapa(estiloId));
          }

          function setDarkMode(isDark) {
            var mapEl = document.getElementById('map');

            if (!mapEl) {
              return;
            }

            if (isDark) {
              mapEl.classList.add('dark-mode');
              mapEl.classList.remove('light-mode');
              document.body.style.backgroundColor = '#1a1a1a';
              document.documentElement.style.backgroundColor = '#1a1a1a';
            } else {
              mapEl.classList.remove('dark-mode');
              mapEl.classList.add('light-mode');
              document.body.style.backgroundColor = '#f0f0f0';
              document.documentElement.style.backgroundColor = '#f0f0f0';
            }
          }

          function setTrafficVisibility(showTraffic) {
            if (!map) return;

            if (showTraffic) {
              if (!trafficTiles) {
                trafficTiles = L.tileLayer('https://mt0.google.com/vt?lyrs=traffic&x={x}&y={y}&z={z}', {
                  maxZoom: 20,
                  opacity: 0.9,
                });
              }

              if (!map.hasLayer(trafficTiles)) {
                trafficTiles.addTo(map);
              }
            } else if (trafficTiles && map.hasLayer(trafficTiles)) {
              map.removeLayer(trafficTiles);
            }
          }

          window.onload = function() {
            map = L.map('map', { 
              zoomControl: false, 
              attributionControl: false 
            }).setView([${latitudeInicial}, ${longitudeInicial}], 15);

            tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
              maxZoom: 19
            }).addTo(map);

            linesLayer = L.layerGroup().addTo(map);
            vehiclesLayer = L.layerGroup().addTo(map);

            userMarker = L.marker([${latitudeInicial}, ${longitudeInicial}], {
              icon: L.divIcon({
                className: 'user-container',
                html: '<div class="user-arrow"></div><div class="user-dot"></div>',
                iconSize: [20, 20], 
                iconAnchor: [10, 10] 
              }),
              zIndexOffset: 1000
            }).addTo(map);

            setMapStyle('${ESTILO_MAPA_PADRAO}');
            setDarkMode(false);

            map.on('movestart', function() {
              if (!internalMove) {
                autoFollow = false;
              }
            });

            map.on('zoomstart', function() {
              if (!internalMove) {
                autoFollow = false;
              }
            });

            map.on('moveend', function() {
              internalMove = false;
            });

            map.on('zoomend', function() {
              internalMove = false;
            });

            if(window.pendingData) {
              window.updateMap(window.pendingData);
            }
            
            window.ReactNativeWebView?.postMessage("map_ready");
          };

          window.centerOnUser = function() {
            autoFollow = true;
            runInternalMove(function() {
              map.flyTo(userMarker.getLatLng(), 17);
            });
          };
          
          window.fitToCoordinates = function(coordinates) {
            if(coordinates && coordinates.length > 0) {
              autoFollow = false;
              var bounds = L.latLngBounds(coordinates.map(function(c) { 
                return [c.latitude, c.longitude]; 
              }));
              runInternalMove(function() {
                map.fitBounds(bounds, {
                  padding: [50, 50],
                  animate: true,
                  duration: 0.8
                });
              });
            }
          };

          function clearVehicleMarkers() {
            Object.keys(vehicleMarkers).forEach(function(vehicleKey) {
              stopVehicleAnimation(vehicleKey);
              vehiclesLayer.removeLayer(vehicleMarkers[vehicleKey]);
              delete vehicleMarkers[vehicleKey];
              delete vehicleHeadings[vehicleKey];
            });
          }

          window.updateMap = function(data) {
            if(!map || !linesLayer || !vehiclesLayer) return;

            setMapStyle(data.estiloMapa);
            setDarkMode(Boolean(data.darkMode));
            setTrafficVisibility(Boolean(data.showTraffic));

            var pos = L.latLng(data.userLocation[0], data.userLocation[1]);
            userMarker.setLatLng(pos);
            
            var arrow = document.querySelector('.user-arrow');
            if(arrow) {
              if(data.heading !== null && data.heading !== undefined) {
                arrow.style.display = 'block';
                arrow.style.transform = 'rotate(' + data.heading + 'deg)';
              } else {
                arrow.style.display = 'none';
              }
            }

            if(autoFollow) {
              runInternalMove(function() {
                map.panTo(pos, { animate: false });
              });
            }

            linesLayer.clearLayers();

            if(!Array.isArray(data.linhas) || data.linhas.length === 0) {
              clearVehicleMarkers();
              return;
            }

            var vehicleKeysVisiveis = {};

            data.linhas.forEach(function(linha) {
              var lineColor = linha.cor || (data.darkMode ? '#4FC3F7' : '#2196F3');
              var segmentos = [];

              if (Array.isArray(linha.segmentos) && linha.segmentos.length > 0) {
                segmentos = linha.segmentos;
              } else if (Array.isArray(linha.coordenadas) && linha.coordenadas.length > 0) {
                segmentos = [linha.coordenadas];
              }

              segmentos.forEach(function(segmento) {
                if (Array.isArray(segmento) && segmento.length > 1) {
                  L.polyline(segmento, {
                    color: lineColor,
                    weight: 4,
                    opacity: data.darkMode ? 0.82 : 0.62
                  }).addTo(linesLayer);
                }
              });

              if(!Array.isArray(linha.posicoes)) {
                return;
              }

              linha.posicoes.forEach(function(p, indexVeiculo) {
                var lat = parseMaybeNumber(p.latitude !== undefined ? p.latitude : p.lat);
                var lng = parseMaybeNumber(p.longitude !== undefined ? p.longitude : p.lng);

                if(lat === null || lng === null) {
                  return;
                }

                var rawId = p.id || p.codigo || p.ordem;
                var vehicleId = rawId ? String(rawId).trim() : (linha.nome + '-' + indexVeiculo);
                var vehicleKey = (linha.modal || 'modal') + ':' + linha.nome + ':' + vehicleId;
                vehicleKeysVisiveis[vehicleKey] = true;

                var destination = L.latLng(lat, lng);
                var marker = vehicleMarkers[vehicleKey];
                var heading = normalizeHeading(p.direcao);
                var previousHeading = vehicleHeadings[vehicleKey];

                if (!marker) {
                  marker = L.marker(destination, {
                    icon: createVehicleIcon(lineColor, heading),
                    zIndexOffset: 500,
                  });

                  var popupInicial = buildVehiclePopup(linha, p, vehicleId, heading);
                  marker.bindPopup(popupInicial);
                  marker.addTo(vehiclesLayer);
                  vehicleMarkers[vehicleKey] = marker;

                  if (typeof heading === 'number') {
                    vehicleHeadings[vehicleKey] = heading;
                  }

                  return;
                }

                var previousLatLng = marker.getLatLng();

                if (heading === null) {
                  heading = calculateHeading(previousLatLng, destination);
                }

                if (heading === null && typeof previousHeading === 'number') {
                  heading = previousHeading;
                }

                animateVehicleTo(vehicleKey, marker, destination, 1600);

                if (typeof heading === 'number') {
                  vehicleHeadings[vehicleKey] = heading;
                  setVehicleHeading(marker, heading);
                }

                var popupInfo = buildVehiclePopup(linha, p, vehicleId, heading);
                marker.setPopupContent(popupInfo);
              });
            });

            Object.keys(vehicleMarkers).forEach(function(vehicleKey) {
              if (!vehicleKeysVisiveis[vehicleKey]) {
                stopVehicleAnimation(vehicleKey);
                vehiclesLayer.removeLayer(vehicleMarkers[vehicleKey]);
                delete vehicleMarkers[vehicleKey];
                delete vehicleHeadings[vehicleKey];
              }
            });
          };
        </script>
      </body>
    </html>
    `,
      [latitudeInicial, longitudeInicial],
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
          webViewRef.current?.injectJavaScript(`if(map) map.invalidateSize();`);
        }}
        onMessage={(event) => {
          if (event.nativeEvent.data === "map_ready") {
            setMapReady(true);
          }
        }}
      />
    );
  },
);

MapaOSM.displayName = "MapaOSM";

export default MapaOSM;
