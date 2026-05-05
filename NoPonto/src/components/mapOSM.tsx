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

// Atualiza a interface LinhaParaMostrar para incluir mapeamento itinerarioId -> segmento
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
   * Mapeamento de itinerarioId -> índice do segmento.
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
  onStopPress?: (parada: Parada) => void;
}

export interface MapaOSMRef {
  centerOnUser: () => void;
  fitToCoordinates: (
    coordinates: { latitude: number; longitude: number }[],
  ) => void;
  mostrarPoi: (payload: {
    poi: { lat: number; lng: number; nome?: string };
    parada?: { lat: number; lng: number; nome?: string } | null;
    distancia?: number | null;
    icone?: string;
    cor?: string;
  }) => void;
  limparPoi: () => void;
}

const estilosJS = estilosMapaDisponiveis.map((e) => `"${e.id}"`).join(", ");

const filtrosMapaJS = estilosMapaDisponiveis
  .map((e) => `"${e.id}":{light:"${e.filtroLight}",dark:"${e.filtroDark}"}`)
  .join(",");

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
      mostrarPoi: (payload) => {
        webViewRef.current?.injectJavaScript(
          `if(window.mostrarConexaoPoi) window.mostrarConexaoPoi(${JSON.stringify(payload)});`,
        );
      },
      limparPoi: () => {
        webViewRef.current?.injectJavaScript(
          `if(window.limparConexaoPoi) window.limparConexaoPoi();`,
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
  <link href="https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.css" rel="stylesheet"/>
  <script src="https://unpkg.com/maplibre-gl@3.6.1/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    html,body{height:100%;width:100%;margin:0;padding:0;background:#f0f0f0}
    #map{height:100%;width:100%;position:absolute;top:0;left:0}
    .maplibregl-canvas{outline:none}
    .maplibregl-marker{cursor:pointer}
    .maplibregl-popup-content{font-size:12px;line-height:1.4;min-width:200px;margin:0;padding:8px 10px;border-radius:12px;box-shadow:0 3px 10px rgba(0,0,0,.2);background:#fff;color:#111}
    .maplibregl-popup-close-button{display:none}

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
    .stop-pin{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.95);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;position:relative}
    .stop-core{width:6px;height:6px;border-radius:50%;background:var(--stop-color,#2196F3)}
    .stop-pin:after{content:'';position:absolute;left:50%;top:50%;width:14px;height:14px;border-radius:50%;border:2px solid var(--stop-color,#2196F3);transform:translate(-50%,-50%);opacity:.45;animation:stopPulse 2.4s ease-out infinite}
    @keyframes stopPulse{0%{transform:translate(-50%,-50%) scale(.6);opacity:.45}70%{transform:translate(-50%,-50%) scale(1.8);opacity:0}100%{opacity:0}}
    @keyframes iconPulse{0%{transform:translate(-50%,-50%) scale(.8);opacity:.5}70%{transform:translate(-50%,-50%) scale(1.9);opacity:0}100%{opacity:0}}

    .popup-card{display:flex;flex-direction:column;gap:6px}
    .popup-header{display:flex;align-items:center;gap:8px}
    .popup-indicator{width:28px;height:28px;position:relative;flex:0 0 28px;border-radius:10px;background:#fff;border:1.5px solid currentColor;color:var(--c,#2196F3);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.18)}
    .popup-indicator:after{content:'';position:absolute;left:50%;top:50%;width:26px;height:26px;border-radius:12px;border:2px solid currentColor;transform:translate(-50%,-50%);opacity:.45;animation:iconPulse 2.6s ease-out infinite}
    .popup-indicator svg{width:16px;height:16px;stroke:currentColor;stroke-width:2;fill:none}
    .popup-title{font-weight:700;font-size:14px;color:#111}
    .popup-sub{font-size:12px;color:#555}
    .popup-time{font-size:12px;color:#666}
    .popup-main{display:flex;flex-direction:column;gap:2px}
    .popup-toggle{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:#f3f4f6;color:#1f2937;font-weight:600;font-size:12px;cursor:pointer;user-select:none;align-self:flex-start;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .popup-toggle .toggle-chevron{width:8px;height:8px;border:2px solid currentColor;border-left:0;border-top:0;transform:rotate(45deg);transition:transform .2s ease}
    .popup-toggle.open .toggle-chevron{transform:rotate(-135deg)}
    .popup-details{max-height:0;opacity:0;overflow:hidden;border-top:1px dashed #e5e7eb;padding-top:0;margin-top:2px;transition:max-height .25s ease,opacity .2s ease,padding-top .2s ease}
    .popup-details.open{max-height:160px;opacity:1;padding-top:8px}
    .popup-row{display:flex;gap:6px;color:#555}
    .popup-label{font-weight:600;color:#333;min-width:86px}

    .stop-popup{min-width:180px}
    .stop-title{font-weight:700;font-size:14px;color:#111}
    .stop-sub{font-size:11px;color:#666;margin-top:2px}
    .stop-hint{font-size:11px;color:#6b7280;margin-top:6px}

    .poi-marker{width:28px;height:28px;border-radius:12px;background:#fff;border:1.5px solid var(--c,#f59e0b);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.25);position:relative}
    .poi-marker:after{content:'';position:absolute;left:50%;top:50%;width:26px;height:26px;border-radius:12px;border:2px solid var(--c,#f59e0b);transform:translate(-50%,-50%);opacity:.35;animation:iconPulse 2.4s ease-out infinite}
    .poi-marker svg{width:16px;height:16px;stroke:var(--c,#f59e0b);stroke-width:2;fill:none}
    .poi-distance{padding:4px 10px;border-radius:999px;background:#111;color:#fff;font-size:11px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,.25);white-space:nowrap;display:inline-block;min-width:46px;text-align:center}

    #map.dark-mode .maplibregl-popup-content{background:#1b1f24;color:#e5e7eb}
    #map.dark-mode .maplibregl-popup-tip{border-top-color:#1b1f24}
    #map.dark-mode .popup-title{color:#f3f4f6}
    #map.dark-mode .popup-sub,#map.dark-mode .popup-time,#map.dark-mode .popup-row{color:#cbd5e1}
    #map.dark-mode .popup-label{color:#e5e7eb}
    #map.dark-mode .popup-toggle{background:#2a2f35;color:#e5e7eb}
    #map.dark-mode .popup-details{border-top-color:#3b4047}
    #map.dark-mode .popup-indicator{background:#1b1f24;box-shadow:0 2px 8px rgba(0,0,0,.45)}
  </style>
</head>
<body>
<div id="map"></div>
<script>
var map,userMarker;
var linesSourceId='lines-source',linesSolidLayerId='lines-solid',linesDashLayerId='lines-dash';
var trafficSourceId='traffic-source',trafficLayerId='traffic-layer';
var poiLineSourceId='poi-line-source',poiLineLayerId='poi-line-layer';
var stopMarkers=[],poiMarker=null,poiDistanceMarker=null;
var estilos=[${estilosJS}];
var filtrosMapa={${filtrosMapaJS}};
var currentStyleId='${ESTILO_MAPA_PADRAO}';
var isDark=false;
var vehicleMarkers={},vehicleHeadings={},vehiclePopups={},animFrames={},drState={};
var autoFollow=true,internalMove=false;
var mapReady=false;
var drInterval=null;
var lastDrLog=0;

// ── Dead reckoning ────────────────────────────────────────────────────────────
// drState[vKey] = { marker, posicaoNaRota, comprimentoMetros, velocidade, lineCoords }
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
      if(coord&&s.marker){
        s.marker.setLngLat([coord[1],coord[0]]);
        var h=headingNaRota(s.lineCoords,s.posicaoNaRota);
        if(typeof h==='number'){vehicleHeadings[k]=h;setHeading(s.marker,h);}
      }
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

function headingNaRota(coords,pos){
  if(!coords||coords.length<2||pos===null||pos===undefined)return null;
  var delta=0.0015;
  var p1=interpolarNaRota(coords,Math.max(0,pos-delta));
  var p2=interpolarNaRota(coords,Math.min(1,pos+delta));
  if(!p1||!p2)return null;
  return calcHeading({lat:p1[0],lng:p1[1]},{lat:p2[0],lng:p2[1]});
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

function safeId(v){
  return String(v).replace(/[^a-zA-Z0-9_-]/g,'_');
}

function stopAnim(key){if(animFrames[key]){cancelAnimationFrame(animFrames[key]);delete animFrames[key]}}

function animateTo(key,marker,dest,ms){
  stopAnim(key);
  var start=marker.getLngLat();
  var dx=start.lng-dest.lng,dy=start.lat-dest.lat;
  if(Math.sqrt(dx*dx+dy*dy)<0.000005){marker.setLngLat([dest.lng,dest.lat]);return}
  var t0=performance.now();
  function step(ts){
    var p=Math.min((ts-t0)/ms,1);
    var lat=start.lat+(dest.lat-start.lat)*p;
    var lng=start.lng+(dest.lng-start.lng)*p;
    marker.setLngLat([lng,lat]);
    if(p<1)animFrames[key]=requestAnimationFrame(step);else delete animFrames[key];
  }
  animFrames[key]=requestAnimationFrame(step);
}

function busIcon(color,heading){
  var el=document.createElement('div');
  el.className='bus-marker';
  el.innerHTML='<div class="bus-inner" style="--h:'+(heading||0)+'deg">'+
               '<div class="bus-blob" style="background:'+color+'"></div>'+
               '<div class="bus-arrow"></div></div>';
  return el;
}

function stopIcon(color){
  var el=document.createElement('div');
  el.className='stop-marker';
  el.innerHTML='<div class="stop-pin" style="--stop-color:'+color+'"><div class="stop-core"></div></div>';
  return el;
}

function poiIcon(iconName,color){
  var icon=iconName||'map-pin';
  var el=document.createElement('div');
  el.className='poi-marker';
  el.style.setProperty('--c',color);
  el.innerHTML='<i data-lucide="'+icon+'"></i>';
  return el;
}

function userIcon(){
  var el=document.createElement('div');
  el.className='user-container';
  el.innerHTML='<div class="user-arrow"></div><div class="user-dot"></div>';
  return el;
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

function formatElapsed(ts){
  var diff=Math.max(0,Math.floor((Date.now()-ts)/1000));
  var m=Math.floor(diff/60);
  var s=diff%60;
  if(m>0)return m+'m '+(s<10?'0':'')+s+'s';
  return s+'s';
}

function updateTimeAgo(){
  var els=document.querySelectorAll('.ts-ago');
  for(var i=0;i<els.length;i++){
    var el=els[i];
    var ts=Number(el.getAttribute('data-ts'));
    if(!ts)continue;
    el.textContent=formatElapsed(ts);
  }
}

function toggleDetails(btn){
  if(!btn)return;
  var id=btn.getAttribute('data-target');
  if(!id)return;
  var el=document.getElementById(id);
  if(!el)return;
  var open=el.classList.contains('open');
  var label=btn.querySelector('.toggle-label');
  if(open){
    el.classList.remove('open');
    btn.classList.remove('open');
    if(label)label.textContent='Mais detalhes';
  }else{
    el.classList.add('open');
    btn.classList.add('open');
    if(label)label.textContent='Menos detalhes';
  }
}

function modalIconSvg(modal){
  var m=(modal||'onibus').toLowerCase();
  if(m==='trem'||m==='metro'){
    return '<i data-lucide="train" class="modal-icon"></i>';
  }
  return '<i data-lucide="bus" class="modal-icon"></i>';
}

function buildPopup(linha,p,vid,heading){
  var speed=parseNum(p.velocidadeMedia!=null?p.velocidadeMedia:p.velocidade);
  var tsRaw=parseNum(p.timestamp);
  if(tsRaw&&tsRaw<1e12)tsRaw*=1000;
  var tsMs=tsRaw||null;
  var sentido=null;
  if(p.itinerarioId&&linha&&linha.itinerarioSegmentoMap){
    var segIdx=linha.itinerarioSegmentoMap[p.itinerarioId];
    if(segIdx===0)sentido='Ida';
    else if(segIdx===1)sentido='Volta';
  }
  if(!sentido&&p.sentidoNome)sentido=p.sentidoNome;
  if(sentido&&linha&&linha.nome&&sentido===linha.nome)sentido=null;
  if(!sentido&&linha&&linha.modoSentido){
    if(linha.modoSentido==='ida')sentido='Ida';
    else if(linha.modoSentido==='volta')sentido='Volta';
    else if(linha.modoSentido==='ambos')sentido='Ida/Volta';
  }
  var sentidoLabel=sentido||'-';
  var color=linha.cor||null;
  var corFinal=color||'#2196F3';
  var headingDeg=typeof heading==='number'?heading:0;
  var popupId='popup_'+safeId(linha.nome+'_'+vid);
  var detailsId=popupId+'_details';
  var tempoHtml=tsMs?('<span class="ts-ago" data-ts="'+tsMs+'">'+formatElapsed(tsMs)+'</span>'):'-';
  var speedHtml=speed!==null?Math.round(speed)+' km/h':'-';
  var prox=p.proximaParadaNome?p.proximaParadaNome:'-';
  var dist=p.distanciaProximaParadaMetros!=null?Math.round(p.distanciaProximaParadaMetros)+' m':'-';
  var iconSvg=modalIconSvg(linha.modal);
  var html='<div class="popup-card" id="'+popupId+'">';
  html+='<div class="popup-header">';
  html+='<div class="popup-indicator" style="--c:'+corFinal+'">'+iconSvg+'</div>';
  html+='<div class="popup-main">';
  html+='<div class="popup-title">'+linha.nome+'</div>';
  html+='<div class="popup-sub">Sentido: '+sentidoLabel+'</div>';
  html+='<div class="popup-time">Atualizado ha '+tempoHtml+'</div>';
  html+='</div>';
  html+='</div>';
  html+='<div class="popup-toggle" data-target="'+detailsId+'" onclick="toggleDetails(this)">'+
        '<span class="toggle-label">Mais detalhes</span><span class="toggle-chevron"></span></div>';
  html+='<div class="popup-details" id="'+detailsId+'">';
  html+='<div class="popup-row"><span class="popup-label">Vel. media:</span>'+speedHtml+'</div>';
  html+='<div class="popup-row"><span class="popup-label">Prox. parada:</span>'+prox+'</div>';
  html+='<div class="popup-row"><span class="popup-label">Distancia:</span>'+dist+'</div>';
  html+='</div>';
  html+='</div>';
  return html;
}

function buildStopPopup(parada){
  var nome=(parada&&parada.nome)?parada.nome:'Parada';
  var ordem=(parada&&parada.ordem!=null)?('Parada #'+parada.ordem):'';
  var html='<div class="stop-popup">';
  html+='<div class="stop-title">'+nome+'</div>';
  if(ordem)html+='<div class="stop-sub">'+ordem+'</div>';
  html+='<div class="stop-hint">Toque para detalhes</div>';
  html+='</div>';
  return html;
}

function emptyGeo(){
  return{type:'FeatureCollection',features:[]};
}

function ensureLayers(){
  if(!map)return;
  if(!map.getSource(trafficSourceId)){
    map.addSource(trafficSourceId,{type:'raster',tiles:['https://mt0.google.com/vt?lyrs=traffic&x={x}&y={y}&z={z}'],tileSize:256});
    map.addLayer({id:trafficLayerId,type:'raster',source:trafficSourceId,paint:{'raster-opacity':0.9},layout:{'visibility':'none'}});
  }
  if(!map.getSource(linesSourceId)){
    map.addSource(linesSourceId,{type:'geojson',data:emptyGeo()});
    map.addLayer({id:linesSolidLayerId,type:'line',source:linesSourceId,filter:['==',['get','dash'],0],paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':0.65}});
    map.addLayer({id:linesDashLayerId,type:'line',source:linesSourceId,filter:['==',['get','dash'],1],paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':0.85,'line-dasharray':[8,5]}});
  }
  if(!map.getSource(poiLineSourceId)){
    map.addSource(poiLineSourceId,{type:'geojson',data:emptyGeo()});
    map.addLayer({id:poiLineLayerId,type:'line',source:poiLineSourceId,paint:{'line-color':['get','color'],'line-width':2,'line-opacity':0.9,'line-dasharray':[6,6]}});
  }
}

function setLinesData(features){
  var src=map&&map.getSource(linesSourceId);
  if(src&&src.setData){
    src.setData({type:'FeatureCollection',features:features});
  }
}

function setPoiLine(coords,color){
  var src=map&&map.getSource(poiLineSourceId);
  if(!src||!src.setData)return;
  if(!coords||coords.length<2){
    src.setData(emptyGeo());
    return;
  }
  src.setData({
    type:'FeatureCollection',
    features:[{type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{color:color}}]
  });
}

function clearStops(){
  for(var i=0;i<stopMarkers.length;i++){
    stopMarkers[i].remove();
  }
  stopMarkers=[];
}

function clearVehicles(){
  Object.keys(vehicleMarkers).forEach(function(k){
    stopAnim(k);
    vehicleMarkers[k].remove();
    if(vehiclePopups[k])vehiclePopups[k].remove();
    delete vehicleMarkers[k];delete vehicleHeadings[k];delete drState[k];delete vehiclePopups[k];
  });
}

function clearPoi(){
  if(poiMarker){poiMarker.remove();poiMarker=null;}
  if(poiDistanceMarker){poiDistanceMarker.remove();poiDistanceMarker=null;}
  setPoiLine(null,null);
}

function showPoi(payload){
  if(!payload||!payload.poi||!map)return;
  clearPoi();
  var poi=payload.poi;
  var parada=payload.parada||null;
  var color=payload.cor||'#f59e0b';
  var icon=payload.icone||'map-pin';
  var el=poiIcon(icon,color);
  poiMarker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([poi.lng,poi.lat]).addTo(map);

  if(parada&&parada.lat!=null&&parada.lng!=null){
    setPoiLine([[parada.lng,parada.lat],[poi.lng,poi.lat]],color);
    if(payload.distancia!=null){
      var midLng=(parada.lng+poi.lng)/2;
      var midLat=(parada.lat+poi.lat)/2;
      var distEl=document.createElement('div');
      distEl.className='poi-distance';
      distEl.textContent=payload.distancia+' m';
      poiDistanceMarker=new maplibregl.Marker({element:distEl,anchor:'center'}).setLngLat([midLng,midLat]).addTo(map);
    }
  }

  if(window.lucide&&window.lucide.createIcons){
    window.lucide.createIcons();
  }
}

function normEstilo(id){
  return(typeof id==='string'&&estilos.indexOf(id)>=0)?id:'${ESTILO_MAPA_PADRAO}';
}

function applyMapFilter(){
  if(!map)return;
  var conf=filtrosMapa[currentStyleId]||{light:'none',dark:'none'};
  var filtro=isDark?conf.dark:conf.light;
  map.getCanvas().style.filter=filtro||'none';
}

function setMapStyle(id){
  currentStyleId=normEstilo(id);
  applyMapFilter();
}

function setDark(dark){
  var el=document.getElementById('map');if(!el)return;
  isDark=!!dark;
  if(isDark){el.classList.add('dark-mode');el.classList.remove('light-mode');document.body.style.background='#1a1a1a'}
  else{el.classList.remove('dark-mode');el.classList.add('light-mode');document.body.style.background='#f0f0f0'}
  applyMapFilter();
}

function setTraffic(show){
  if(!map||!map.getLayer(trafficLayerId))return;
  map.setLayoutProperty(trafficLayerId,'visibility',show?'visible':'none');
}

function setLineOpacity(dark){
  if(map&&map.getLayer(linesSolidLayerId)){
    map.setPaintProperty(linesSolidLayerId,'line-opacity',dark?0.85:0.65);
  }
  if(map&&map.getLayer(linesDashLayerId)){
    map.setPaintProperty(linesDashLayerId,'line-opacity',dark?0.85:0.65);
  }
}

function boundsFromCoords(coords){
  var minLat=90,minLng=180,maxLat=-90,maxLng=-180;
  for(var i=0;i<coords.length;i++){
    var lat=parseNum(coords[i].latitude),lng=parseNum(coords[i].longitude);
    if(lat===null||lng===null)continue;
    if(lat<minLat)minLat=lat;
    if(lng<minLng)minLng=lng;
    if(lat>maxLat)maxLat=lat;
    if(lng>maxLng)maxLng=lng;
  }
  if(minLat===90||minLng===180||maxLat===-90||maxLng===-180)return null;
  return[[minLng,minLat],[maxLng,maxLat]];
}

window.onload=function(){
  map=new maplibregl.Map({
    container:'map',
    style:'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    center:[${lngInicial},${latInicial}],
    zoom:15,
    attributionControl:false
  });

  map.on('load',function(){
    mapReady=true;
    map.getCanvas().style.transition='filter .25s ease';
    ensureLayers();
    userMarker=new maplibregl.Marker({element:userIcon(),anchor:'center'}).setLngLat([${lngInicial},${latInicial}]).addTo(map);
    setMapStyle('${ESTILO_MAPA_PADRAO}');
    setDark(false);

    map.on('movestart',function(){if(!internalMove)autoFollow=false});
    map.on('zoomstart',function(){if(!internalMove)autoFollow=false});
    map.on('moveend',function(){internalMove=false});
    map.on('zoomend',function(){internalMove=false});

    startDR();
    setInterval(updateTimeAgo,1000);

    if(window.pendingData)window.updateMap(window.pendingData);
    window.mostrarConexaoPoi=showPoi;
    window.limparConexaoPoi=clearPoi;
    if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
      window.ReactNativeWebView.postMessage('map_ready');
    }
  });
};

window.centerOnUser=function(){
  if(!map||!userMarker)return;
  autoFollow=true;
  var pos=userMarker.getLngLat();
  runInternal(function(){map.flyTo({center:[pos.lng,pos.lat],zoom:17})});
};

window.fitToCoordinates=function(coords){
  if(!coords||!coords.length||!map)return;
  autoFollow=false;
  var bounds=boundsFromCoords(coords);
  if(!bounds)return;
  runInternal(function(){map.fitBounds(bounds,{padding:50,duration:800})});
};

window.updateMap=function(data){
  if(!map||!mapReady){window.pendingData=data;return}

  setMapStyle(data.estiloMapa);
  setDark(Boolean(data.darkMode));
  setTraffic(Boolean(data.showTraffic));
  setLineOpacity(Boolean(data.darkMode));

  var pos={lat:data.userLocation[0],lng:data.userLocation[1]};
  if(userMarker)userMarker.setLngLat([pos.lng,pos.lat]);

  var arrow=document.querySelector('.user-arrow');
  if(arrow){
    if(data.heading!=null){arrow.style.display='block';arrow.style.transform='rotate('+data.heading+'deg)'}
    else arrow.style.display='none';
  }

  if(autoFollow)runInternal(function(){map.jumpTo({center:[pos.lng,pos.lat]})});

  clearStops();

  var lineFeatures=[];

  if(!Array.isArray(data.linhas)||data.linhas.length===0){
    setLinesData(lineFeatures);
    clearVehicles();
    return;
  }

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
      var coords=seg.map(function(c){return[c[1],c[0]]});
      lineFeatures.push({
        type:'Feature',
        geometry:{type:'LineString',coordinates:coords},
        properties:{color:color,dash:idx===1?1:0,width:idx===1?3:4}
      });
    });

    if(linha.mostrarParadas&&Array.isArray(linha.paradas)){
      linha.paradas.forEach(function(parada){
        var lat=parseNum(parada.latitude),lng=parseNum(parada.longitude);
        if(lat===null||lng===null)return;
        var el=stopIcon(color);
        var marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lng,lat]);
        var popup=new maplibregl.Popup({offset:16,closeButton:false}).setHTML(buildStopPopup(parada));
        marker.setPopup(popup);
        el.addEventListener('click',function(){
          if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
            window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop_click',parada:parada}));
          }
        });
        marker.addTo(map);
        stopMarkers.push(marker);
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

      var dest={lat:lat,lng:lng};
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

      if(posicaoNaRota!==null&&lineCoordsDR){
        var hRoute=headingNaRota(lineCoordsDR,posicaoNaRota);
        if(typeof hRoute==='number')heading=hRoute;
      }

      var marker=vehicleMarkers[vKey];
      var popup=vehiclePopups[vKey];

      if(!marker){
        var posInicial=dest;
        if(posicaoNaRota!==null&&lineCoordsDR){
          var c=interpolarNaRota(lineCoordsDR,posicaoNaRota);
          if(c)posInicial={lat:c[0],lng:c[1]};
        }
        var el=busIcon(color,heading||0);
        marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([posInicial.lng,posInicial.lat]);
        popup=new maplibregl.Popup({offset:18,closeButton:false}).setHTML(buildPopup(linha,p,vid,heading));
        marker.setPopup(popup);
        marker.addTo(map);
        vehicleMarkers[vKey]=marker;
        vehiclePopups[vKey]=popup;
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
      var prevPos=marker.getLngLat();
      if(heading===null)heading=calcHeading({lat:prevPos.lat,lng:prevPos.lng},dest);
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
          var target={lat:coordDR[0],lng:coordDR[1]};
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

      if(popup){
        popup.setHTML(buildPopup(linha,p,vid,heading));
      }
    });
  });

  setLinesData(lineFeatures);

  // Remove veículos que não vieram neste update
  Object.keys(vehicleMarkers).forEach(function(k){
    if(!visibleKeys[k]){
      stopAnim(k);
      vehicleMarkers[k].remove();
      if(vehiclePopups[k])vehiclePopups[k].remove();
      delete vehicleMarkers[k];delete vehicleHeadings[k];delete drState[k];delete vehiclePopups[k];
    }
  });

  if(window.lucide&&window.lucide.createIcons){
    window.lucide.createIcons();
  }
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
          webViewRef.current?.injectJavaScript(`if(map) map.resize();`);
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
            // ignora mensagens nao JSON
          }
        }}
      />
    );
  },
);

MapaOSM.displayName = "MapaOSM";

export default MapaOSM;
