import {
  ESTILO_MAPA_PADRAO,
  EstiloMapaId,
  estilosMapaDisponiveis,
} from "@/src/constants/estilosMapa";
import { Parada } from "@/src/types/transporte";
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { WebView } from "react-native-webview";

// Atualiza a interface LinhaParaMostrar para incluir mapeamento itinerarioId → segmento
export interface LinhaParaMostrar {
  nome: string;
  cor?: string;
  modal?: string;
  segmentos?: [number, number][][];
  coordenadas?: [number, number][];
  paradas?: Parada[];
  mostrarParadas?: boolean;
  modoSentido?: string;
  /**
   * Mapeamento de itinerarioId → índice do segmento.
   * Permite o dead reckoning usar o segmento correto para cada veículo.
   * ex: { "uuid-ida": 0, "uuid-volta": 1 }
   */
  itinerarioSegmentoMap?: Record<string, number>;
  posicoes?: {
    id?: string;
    latitude?: number | string;
    longitude?: number | string;
    direcao?: number | string | null;
    velocidade?: number | string;
    velocidadeMedia?: number | null;
    sentidoNome?: string;
    timestamp?: number | string;
    proximaParadaNome?: string | null;
    distanciaProximaParadaMetros?: number | null;
    status?: number;
    posicaoNaRota?: number | null;
    comprimentoRotaMetros?: number | null;
    itinerarioId?: string | null; // ← garante que está na interface
  }[];
}

interface MapaOSMProps {
  location: any;
  linhasParaMostrar: LinhaParaMostrar[];
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
  .map((e) => `estilo-${e.id}`)
  .join(" ");

const filtrosCSS = estilosMapaDisponiveis
  .map(
    (e) => `
  #map.light-mode.estilo-${e.id} .leaflet-tile { filter: ${e.filtroLight}; }
  #map.dark-mode.estilo-${e.id}  .leaflet-tile { filter: ${e.filtroDark}; }`,
  )
  .join("\n");

const estilosJS = estilosMapaDisponiveis.map((e) => `"${e.id}"`).join(", ");

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
    const coordInicialRef = useRef<{
      latitude: number;
      longitude: number;
    } | null>(null);

    if (!coordInicialRef.current && location?.coords) {
      coordInicialRef.current = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    }

    const latInicial =
      coordInicialRef.current?.latitude ??
      location?.coords?.latitude ??
      -22.9068;
    const lngInicial =
      coordInicialRef.current?.longitude ??
      location?.coords?.longitude ??
      -43.1729;

    useImperativeHandle(ref, () => ({
      centerOnUser: () => {
        webViewRef.current?.injectJavaScript(
          `if(window.centerOnUser) window.centerOnUser();`,
        );
      },
      fitToCoordinates: (coordinates) => {
        webViewRef.current?.injectJavaScript(
          `if(window.fitToCoordinates) window.fitToCoordinates(${JSON.stringify(coordinates)});`,
        );
      },
    }));

    const [mapReady, setMapReady] = React.useState(false);

    useEffect(() => {
      if (!mapReady || !location?.coords) return;

      const data = {
        userLocation: [location.coords.latitude, location.coords.longitude],
        heading: location.coords.heading ?? null,
        linhas: linhasParaMostrar,
        darkMode,
        showTraffic,
        estiloMapa,
      };

      webViewRef.current?.injectJavaScript(
        `window.updateMap(${JSON.stringify(data)});`,
      );
    }, [
      mapReady,
      location,
      linhasParaMostrar,
      darkMode,
      showTraffic,
      estiloMapa,
    ]);

    const mapHTML = useMemo(
      () => `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html,body{height:100%;width:100%;margin:0;padding:0;background:#f0f0f0}
    #map{height:100%;width:100%;position:absolute;top:0;left:0}
    .leaflet-tile{transition:filter .25s ease}
    ${filtrosCSS}

    .user-container{display:flex;align-items:center;justify-content:center}
    .user-dot{width:12px;height:12px;background:#4FC3F7;border:2.5px solid white;border-radius:50%;box-shadow:0 0 6px rgba(0,0,0,.4);z-index:2}
    .user-arrow{position:absolute;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:6px solid #4FC3F7;top:-7px;transform-origin:50% 12px;transition:transform .2s ease-out}

    .bus-marker{background:transparent;border:none}
    .bus-inner{position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center}
    .bus-blob{width:18px;height:18px;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,.35)}
    .bus-arrow{
      position:absolute;left:50%;top:50%;width:0;height:0;
      border-left:5px solid transparent;border-right:5px solid transparent;
      border-bottom:10px solid rgba(255,255,255,.95);
      transform:translate(-50%,-50%) rotate(var(--h,0deg)) translateY(-13px);
      transform-origin:50% 50%;transition:transform .4s ease;pointer-events:none
    }

    .stop-marker{background:transparent;border:none}
    .stop-dot{width:9px;height:9px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.35)}

    .leaflet-popup-content{font-size:13px;line-height:1.5;min-width:140px}
    .popup-linha{font-weight:700;font-size:14px;margin-bottom:4px}
    .popup-row{display:flex;gap:6px;color:#555}
    .popup-label{font-weight:600;color:#333}
  </style>
</head>
<body>
<div id="map"></div>
<script>
var map,tiles,trafficTiles,userMarker,linesLayer,stopsLayer,vehiclesLayer;
var estilos=[${estilosJS}];
var classesMapa="${classesEstiloMapa}";
var vehicleMarkers={},animFrames={},vehicleHeadings={};
var autoFollow=true,internalMove=false;

// ── Dead reckoning ────────────────────────────────────────────────────────────
// drState[vKey] = { marker, posicaoNaRota, comprimentoMetros, velocidade, lineCoords }
var drState={};
var drInterval=null;
var lastDrLog=0;

// Comprimento da rota em graus (mesmo sistema que interpolarNaRota usa)
function comprimentoRotaGraus(coords){
  if(!coords||coords.length<2)return 0;
  var total=0;
  for(var i=1;i<coords.length;i++){
    var dy=coords[i][0]-coords[i-1][0],dx=coords[i][1]-coords[i-1][1];
    total+=Math.sqrt(dy*dy+dx*dx);
  }
  return total;
}

// Converte velocidade km/h para graus/s aproximado (1 grau lat ≈ 111km)
function kmhParaGrausPorSeg(kmh){
  // km/h -> graus/s (1 grau ~= 111 km)
  return(kmh/3600)/111;
}

function startDR(){
  if(drInterval)clearInterval(drInterval);
  if(!window.__drStarted){
    console.log('[DR] started');
    window.__drStarted=true;
  }
  var lastTick=Date.now();
  drInterval=setInterval(function(){
    var now=Date.now();
    var dt=(now-lastTick)/1000;
    lastTick=now;
    if(now-lastDrLog>5000){
      console.log('[DR] tick',Object.keys(drState).length);
      lastDrLog=now;
    }
    Object.keys(drState).forEach(function(k){
      var s=drState[k];
      if(!s||!s.lineCoords||s.lineCoords.length<2)return;
      if(!s.velocidade||s.velocidade<1)return;
      if(s.posicaoNaRota===null||s.posicaoNaRota===undefined)return;
      if(s.syncingUntil&&now<s.syncingUntil)return;
      // Cache do comprimento em graus (mesma unidade que interpolarNaRota)
      if(!s.comprimentoGraus){
        s.comprimentoGraus=comprimentoRotaGraus(s.lineCoords);
      }
      if(!s.comprimentoGraus||s.comprimentoGraus<1e-9)return;
      // avanço normalizado = (velocidade em graus/s * dt) / comprimento em graus
      var velGraus=kmhParaGrausPorSeg(s.velocidade);
      var avanco=velGraus*dt/s.comprimentoGraus;
      s.posicaoNaRota=Math.min(1,s.posicaoNaRota+avanco);
      var coord=interpolarNaRota(s.lineCoords,s.posicaoNaRota);
      if(coord&&s.marker)s.marker.setLatLng(L.latLng(coord[0],coord[1]));
    });
  },100);
}

function interpolarNaRota(coords,pos){
  if(!coords||coords.length===0)return null;
  if(pos<=0)return coords[0];
  if(pos>=1)return coords[coords.length-1];
  var total=0,segs=[];
  for(var i=1;i<coords.length;i++){
    var dy=coords[i][0]-coords[i-1][0],dx=coords[i][1]-coords[i-1][1];
    var d=Math.sqrt(dy*dy+dx*dx);segs.push(d);total+=d;
  }
  var alvo=pos*total,acc=0;
  for(var j=0;j<segs.length;j++){
    if(acc+segs[j]>=alvo){
      var t=segs[j]>0?(alvo-acc)/segs[j]:0;
      return[coords[j][0]+(coords[j+1][0]-coords[j][0])*t,
             coords[j][1]+(coords[j+1][1]-coords[j][1])*t];
    }
    acc+=segs[j];
  }
  return coords[coords.length-1];
}

function runInternal(fn){internalMove=true;fn()}

function parseNum(v){
  if(typeof v==='number')return isFinite(v)?v:null;
  if(typeof v==='string'){var n=Number(v.replace(',','.').trim());return isFinite(n)?n:null}
  return null;
}

function normHeading(v){
  var h=parseNum(v);if(h===null)return null;
  var n=h%360;return n<0?n+360:n;
}

function calcHeading(from,to){
  if(!from||!to)return null;
  if(Math.abs(from.lat-to.lat)<1e-5&&Math.abs(from.lng-to.lng)<1e-5)return null;
  var r=Math.PI/180,lat1=from.lat*r,lat2=to.lat*r,dLon=(to.lng-from.lng)*r;
  var y=Math.sin(dLon)*Math.cos(lat2);
  var x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  return(Math.atan2(y,x)*180/Math.PI+360)%360;
}

function stopAnim(key){if(animFrames[key]){cancelAnimationFrame(animFrames[key]);delete animFrames[key]}}

function animateTo(key,marker,dest,ms){
  stopAnim(key);
  var start=marker.getLatLng();
  if(start.distanceTo(dest)<0.5){marker.setLatLng(dest);return}
  var t0=performance.now();
  function step(ts){
    var p=Math.min((ts-t0)/ms,1);
    marker.setLatLng([start.lat+(dest.lat-start.lat)*p,start.lng+(dest.lng-start.lng)*p]);
    if(p<1)animFrames[key]=requestAnimationFrame(step);else delete animFrames[key];
  }
  animFrames[key]=requestAnimationFrame(step);
}

function busIcon(color,heading){
  return L.divIcon({
    className:'bus-marker',
    html:'<div class="bus-inner" style="--h:'+(heading||0)+'deg">'+
         '<div class="bus-blob" style="background:'+color+'"></div>'+
         '<div class="bus-arrow"></div></div>',
    iconSize:[26,26],iconAnchor:[13,13]
  });
}

function stopIcon(color){
  return L.divIcon({
    className:'stop-marker',
    html:'<div class="stop-dot" style="background:'+color+'"></div>',
    iconSize:[9,9],iconAnchor:[4,4]
  });
}

function setHeading(marker,heading){
  if(typeof heading!=='number')return;
  var el=marker.getElement();if(!el)return;
  var inner=el.querySelector('.bus-inner');
  if(inner)inner.style.setProperty('--h',heading+'deg');
}

function fmtTs(v){
  var ms=parseNum(v);if(!ms)return null;
  if(ms<1e12)ms*=1000;
  var d=new Date(ms);return isNaN(d.getTime())?null:d.toLocaleString('pt-BR');
}

function buildPopup(linha,p,vid,heading){
  var speed=parseNum(p.velocidadeMedia!=null?p.velocidadeMedia:p.velocidade);
  var ts=fmtTs(p.timestamp);
  var dir=typeof heading==='number'?Math.round(heading)+'°':null;
  var html='<div class="popup-linha">'+linha.nome+'</div>';
  html+='<div class="popup-row"><span class="popup-label">Veículo:</span>'+vid+'</div>';
  if(speed!==null)html+='<div class="popup-row"><span class="popup-label">Velocidade:</span>'+Math.round(speed)+' km/h</div>';
  if(dir)html+='<div class="popup-row"><span class="popup-label">Direção:</span>'+dir+'</div>';
  if(ts)html+='<div class="popup-row"><span class="popup-label">Atualizado:</span>'+ts+'</div>';
  if(p.proximaParadaNome)html+='<div class="popup-row"><span class="popup-label">Próx. parada:</span>'+p.proximaParadaNome+'</div>';
  if(linha.modal)html+='<div class="popup-row"><span class="popup-label">Modal:</span>'+linha.modal+'</div>';
  return html;
}

function normEstilo(id){
  return(typeof id==='string'&&estilos.indexOf(id)>=0)?id:'${ESTILO_MAPA_PADRAO}';
}
function setMapStyle(id){
  var el=document.getElementById('map');if(!el)return;
  classesMapa.split(' ').forEach(function(c){if(c)el.classList.remove(c)});
  el.classList.add('estilo-'+normEstilo(id));
}
function setDark(dark){
  var el=document.getElementById('map');if(!el)return;
  if(dark){el.classList.add('dark-mode');el.classList.remove('light-mode');document.body.style.background='#1a1a1a'}
  else{el.classList.remove('dark-mode');el.classList.add('light-mode');document.body.style.background='#f0f0f0'}
}
function setTraffic(show){
  if(!map)return;
  if(show){
    if(!trafficTiles)trafficTiles=L.tileLayer('https://mt0.google.com/vt?lyrs=traffic&x={x}&y={y}&z={z}',{maxZoom:20,opacity:.9});
    if(!map.hasLayer(trafficTiles))trafficTiles.addTo(map);
  }else if(trafficTiles&&map.hasLayer(trafficTiles)){map.removeLayer(trafficTiles)}
}
function clearVehicles(){
  Object.keys(vehicleMarkers).forEach(function(k){
    stopAnim(k);vehiclesLayer.removeLayer(vehicleMarkers[k]);
    delete vehicleMarkers[k];delete vehicleHeadings[k];delete drState[k];
  });
}

window.onload=function(){
  map=L.map('map',{zoomControl:false,attributionControl:false}).setView([${latInicial},${lngInicial}],15);
  tiles=L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
  linesLayer=L.layerGroup().addTo(map);
  stopsLayer=L.layerGroup().addTo(map);
  vehiclesLayer=L.layerGroup().addTo(map);

  userMarker=L.marker([${latInicial},${lngInicial}],{
    icon:L.divIcon({className:'user-container',html:'<div class="user-arrow"></div><div class="user-dot"></div>',iconSize:[20,20],iconAnchor:[10,10]}),
    zIndexOffset:1000
  }).addTo(map);

  setMapStyle('${ESTILO_MAPA_PADRAO}');setDark(false);

  map.on('movestart',function(){if(!internalMove)autoFollow=false});
  map.on('zoomstart',function(){if(!internalMove)autoFollow=false});
  map.on('moveend',function(){internalMove=false});
  map.on('zoomend',function(){internalMove=false});

  startDR();

  if(window.pendingData)window.updateMap(window.pendingData);
  window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('map_ready');
};

window.centerOnUser=function(){
  autoFollow=true;
  runInternal(function(){map.flyTo(userMarker.getLatLng(),17)});
};

window.fitToCoordinates=function(coords){
  if(!coords||!coords.length)return;
  autoFollow=false;
  var bounds=L.latLngBounds(coords.map(function(c){return[c.latitude,c.longitude]}));
  runInternal(function(){map.fitBounds(bounds,{padding:[50,50],animate:true,duration:.8})});
};

window.updateMap=function(data){
  if(!map||!linesLayer||!stopsLayer||!vehiclesLayer){window.pendingData=data;return}

  setMapStyle(data.estiloMapa);
  setDark(Boolean(data.darkMode));
  setTraffic(Boolean(data.showTraffic));

  var pos=L.latLng(data.userLocation[0],data.userLocation[1]);
  userMarker.setLatLng(pos);

  var arrow=document.querySelector('.user-arrow');
  if(arrow){
    if(data.heading!=null){arrow.style.display='block';arrow.style.transform='rotate('+data.heading+'deg)'}
    else arrow.style.display='none';
  }

  if(autoFollow)runInternal(function(){map.panTo(pos,{animate:false})});

  linesLayer.clearLayers();
  stopsLayer.clearLayers();

  if(!Array.isArray(data.linhas)||data.linhas.length===0){clearVehicles();return}

  var visibleKeys={};

  data.linhas.forEach(function(linha){
    var color=linha.cor||(data.darkMode?'#4FC3F7':'#2196F3');
    var modo=linha.modoSentido||'ambos';

    var segmentos=[];
    if(Array.isArray(linha.segmentos)&&linha.segmentos.length>0){
      if(modo==='ambos')segmentos=linha.segmentos;
      else if(modo==='ida'&&linha.segmentos[0])segmentos=[linha.segmentos[0]];
      else if(modo==='volta'){
        if(linha.segmentos[1])segmentos=[linha.segmentos[1]];
        else if(linha.segmentos[0])segmentos=[linha.segmentos[0]];
      }
    }else if(Array.isArray(linha.coordenadas)&&linha.coordenadas.length>0){
      segmentos=[linha.coordenadas];
    }

    segmentos.forEach(function(seg,idx){
      if(!Array.isArray(seg)||seg.length<2)return;
      L.polyline(seg,{color:color,weight:idx===1?3:4,opacity:data.darkMode?0.85:0.65,dashArray:idx===1?'8,5':null}).addTo(linesLayer);
    });

    if(linha.mostrarParadas&&Array.isArray(linha.paradas)){
      linha.paradas.forEach(function(parada){
        var lat=parseNum(parada.latitude),lng=parseNum(parada.longitude);
        if(lat===null||lng===null)return;
        var m=L.marker([lat,lng],{icon:stopIcon(color),zIndexOffset:200});
        m.bindPopup('<b>'+parada.nome+'</b>'+(parada.ordem!=null?'<br/>Parada #'+parada.ordem:''));
        m.addTo(stopsLayer);
      });
    }

    if(!Array.isArray(linha.posicoes))return;

    linha.posicoes.forEach(function(p,idx){
      var lat=parseNum(p.latitude!=null?p.latitude:p.lat);
      var lng=parseNum(p.longitude!=null?p.longitude:p.lng);
      if(lat===null||lng===null)return;

      var rawId=p.id||p.codigo||p.ordem;
      var vid=rawId?String(rawId).trim():linha.nome+'-'+idx;
      var vKey=(linha.modal||'m')+':'+linha.nome+':'+vid;
      visibleKeys[vKey]=true;

      var dest=L.latLng(lat,lng);
      var heading=normHeading(p.direcao);
      var prevHeading=vehicleHeadings[vKey];

      var posicaoNaRota=parseNum(p.posicaoNaRota);
      var comprimentoMetros=parseNum(p.comprimentoRotaMetros);
      var velocidade=parseNum(p.velocidadeMedia!=null?p.velocidadeMedia:p.velocidade);

      // Escolhe o segmento correto baseado no itinerarioId do veículo
      var lineCoordsDR=segmentos[0]||null;
      if(p.itinerarioId&&linha.itinerarioSegmentoMap){
        var segIdx=linha.itinerarioSegmentoMap[p.itinerarioId];
        if(typeof segIdx==='number'&&segmentos[segIdx]){
          lineCoordsDR=segmentos[segIdx];
        }
      }

      var marker=vehicleMarkers[vKey];

      if(!marker){
        var posInicial=dest;
        if(posicaoNaRota!==null&&lineCoordsDR){
          var c=interpolarNaRota(lineCoordsDR,posicaoNaRota);
          if(c)posInicial=L.latLng(c[0],c[1]);
        }
        marker=L.marker(posInicial,{icon:busIcon(color,heading||0),zIndexOffset:500});
        marker.bindPopup(buildPopup(linha,p,vid,heading));
        marker.addTo(vehiclesLayer);
        vehicleMarkers[vKey]=marker;
        if(typeof heading==='number')vehicleHeadings[vKey]=heading;
        drState[vKey]={
          marker:marker,
          posicaoNaRota:posicaoNaRota,
          comprimentoGraus:null,
          velocidade:velocidade,
          lineCoords:lineCoordsDR,
          syncingUntil:0
        };
        return;
      }

      // Atualiza heading
      var prevLatLng=marker.getLatLng();
      if(heading===null)heading=calcHeading(prevLatLng,dest);
      if(heading===null&&typeof prevHeading==='number')heading=prevHeading;
      if(typeof heading==='number'){vehicleHeadings[vKey]=heading;setHeading(marker,heading);}

      // Atualiza estado DR com dados frescos do servidor
      if(!drState[vKey])drState[vKey]={};
      var dr=drState[vKey];
      dr.marker=marker;

      // Atualiza rota se mudou
      if(lineCoordsDR&&dr.lineCoords!==lineCoordsDR){
        dr.lineCoords=lineCoordsDR;
        dr.comprimentoGraus=null;
      }

      // Sincroniza posição na rota com o servidor
      // O loop de DR continua avançando a partir daqui
      if(posicaoNaRota!==null){
        dr.posicaoNaRota=posicaoNaRota;
      }else{
        dr.posicaoNaRota=null;
      }
      if(comprimentoMetros!==null)dr.comprimentoMetros=comprimentoMetros;
      if(velocidade!==null)dr.velocidade=velocidade;

      // Reposiciona o marcador na rota interpolada (sincronização com servidor)
      if(posicaoNaRota!==null&&lineCoordsDR){
        var coordDR=interpolarNaRota(lineCoordsDR,posicaoNaRota);
        if(coordDR){
          var target=L.latLng(coordDR[0],coordDR[1]);
          var syncMs=700;
          dr.syncingUntil=Date.now()+syncMs;
          animateTo(vKey,marker,target,syncMs);
        }else{
          // Fallback: sem coord válida, usa animação linear simples
          animateTo(vKey,marker,dest,1600);
        }
      }else{
        // Fallback: sem posicaoNaRota, usa animação linear simples
        animateTo(vKey,marker,dest,1600);
      }

      marker.setPopupContent(buildPopup(linha,p,vid,heading));
    });
  });

  // Remove veículos que não vieram neste update
  Object.keys(vehicleMarkers).forEach(function(k){
    if(!visibleKeys[k]){
      stopAnim(k);vehiclesLayer.removeLayer(vehicleMarkers[k]);
      delete vehicleMarkers[k];delete vehicleHeadings[k];delete drState[k];
    }
  });
};
</script>
</body>
</html>`,
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
