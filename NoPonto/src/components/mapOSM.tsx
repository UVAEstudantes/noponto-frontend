import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { WebView } from "react-native-webview";

interface MapaOSMProps {
  location: any;
  linhasParaMostrar: any[];
  darkMode?: boolean;
}

export interface MapaOSMRef {
  centerOnUser: () => void;
  fitToCoordinates: (
    coordinates: Array<{ latitude: number; longitude: number }>
  ) => void;
}

const MapaOSM = forwardRef<MapaOSMRef, MapaOSMProps>(
  ({ location, linhasParaMostrar, darkMode = false }, ref) => {
    const webViewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      centerOnUser: () => {
        webViewRef.current?.injectJavaScript(
          `if(window.centerOnUser) window.centerOnUser();`
        );
      },
      fitToCoordinates: (
        coordinates: Array<{ latitude: number; longitude: number }>
      ) => {
        const injectJS = `if(window.fitToCoordinates) window.fitToCoordinates(${JSON.stringify(coordinates)});`;
        webViewRef.current?.injectJavaScript(injectJS);
      },
    }));

    useEffect(() => {
      const data = {
        userLocation: [location.coords.latitude, location.coords.longitude],
        heading: location.coords.heading,
        linhas: linhasParaMostrar,
        darkMode: darkMode,
      };

      const injectJS = `
        (function() {
          if(window.updateMap) { 
            window.updateMap(${JSON.stringify(data)}); 
          } else {
            window.pendingData = ${JSON.stringify(data)};
          }
        })();
      `;
      webViewRef.current?.injectJavaScript(injectJS);
    }, [location, linhasParaMostrar, darkMode]);

    const mapHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          html, body { height: 100%; width: 100%; margin: 0; padding: 0; background-color: ${darkMode ? "#1a1a1a" : "#f0f0f0"}; }
          #map { height: 100%; width: 100%; position: absolute; top: 0; left: 0; }
          
          .user-container { 
            display: flex; 
            align-items: center; 
            justify-content: center; 
          }

          .user-dot { 
            width: 12px; 
            height: 12px; 
            background: #2196F3; 
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
            border-bottom: 6px solid #2196F3; 
            
            top: -7px; /* Mais próxima da bolinha devido à altura menor */
            
            /* Ponto de rotação ajustado para o centro da bolinha (6px da seta + 6px de folga) */
            transform-origin: 50% 12px; 
            transition: transform 0.2s ease-out;
          }

          .bus-marker { display: flex; align-items: center; justify-content: center; }
          .bus-blob { 
            width: 16px; 
            height: 16px; 
            border-radius: 50%; 
            border: 2px solid white; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.3); 
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map, tiles, userMarker, linesLayer, vehiclesLayer;
          var autoFollow = true;

          window.onload = function() {
            map = L.map('map', { 
              zoomControl: false, 
              attributionControl: false 
            }).setView([${location.coords.latitude}, ${location.coords.longitude}], 15);

            tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/${darkMode ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png', {
              maxZoom: 19
            }).addTo(map);

            linesLayer = L.layerGroup().addTo(map);
            vehiclesLayer = L.layerGroup().addTo(map);

            userMarker = L.marker([${location.coords.latitude}, ${location.coords.longitude}], {
              icon: L.divIcon({
                className: 'user-container',
                html: '<div class="user-arrow"></div><div class="user-dot"></div>',
                iconSize: [20, 20], 
                iconAnchor: [10, 10] 
              }),
              zIndexOffset: 1000
            }).addTo(map);

            map.on('dragstart', function() { autoFollow = false; });

            if(window.pendingData) {
              window.updateMap(window.pendingData);
            }
            
            setTimeout(function() { map.invalidateSize(); }, 400);
          };

          window.centerOnUser = function() {
            autoFollow = true;
            map.flyTo(userMarker.getLatLng(), 17);
          };
          
          window.fitToCoordinates = function(coordinates) {
            if(coordinates && coordinates.length > 0) {
              autoFollow = false;
              var bounds = L.latLngBounds(coordinates.map(function(c) { 
                return [c.latitude, c.longitude]; 
              }));
              map.fitBounds(bounds, {
                padding: [50, 50],
                animate: true,
                duration: 0.8
              });
            }
          };

          window.updateMap = function(data) {
            if(!map || !linesLayer || !vehiclesLayer) return;

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

            if(autoFollow) map.panTo(pos);

            linesLayer.clearLayers();
            vehiclesLayer.clearLayers();

            if(data.linhas) {
              var hasLines = false;
              data.linhas.forEach(function(linha) {
                if(linha.coordenadas && linha.coordenadas.length > 0) {
                  hasLines = true;
                  L.polyline(linha.coordenadas, {
                    color: linha.cor || '#2196F3',
                    weight: 4,
                    opacity: 0.6
                  }).addTo(linesLayer);
                }

                if(linha.posicoes) {
                  linha.posicoes.forEach(function(p) {
                    var lat = p.latitude || p.lat;
                    var lng = p.longitude || p.lng;
                    if(lat && lng) {
                      var busIcon = L.divIcon({
                        className: 'bus-marker',
                        html: '<div class="bus-blob" style="background-color:' + (linha.cor || '#333') + '"></div>',
                        iconSize: [18, 18], iconAnchor: [9, 9]
                      });
                      L.marker([lat, lng], { icon: busIcon })
                        .bindPopup('<b>' + (linha.nome || 'Transporte') + '</b>')
                        .addTo(vehiclesLayer);
                    }
                  });
                }
              });
              
              // Auto-ajustar zoom se tiver linhas e não estiver seguindo usuário
              if(hasLines && !autoFollow && data.linhas[0].coordenadas.length > 0) {
                var coords = data.linhas[0].coordenadas.map(function(c) { 
                  return { latitude: c[0], longitude: c[1] }; 
                });
                window.fitToCoordinates(coords);
              }
            }
            map.invalidateSize();
          };
        </script>
      </body>
    </html>
    `;

    return (
      <WebView
        ref={webViewRef}
        originWhitelist={["*"]}
        source={{ html: mapHTML }}
        style={{ flex: 1, backgroundColor: darkMode ? "#1a1a1a" : "#fff" }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onLoadEnd={() => {
          webViewRef.current?.injectJavaScript(`if(map) map.invalidateSize();`);
        }}
      />
    );
  }
);

export default MapaOSM;
