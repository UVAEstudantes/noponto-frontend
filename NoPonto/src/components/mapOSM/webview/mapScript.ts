// Responsabilidade: script que roda dentro da WebView e controla MapLibre,
// markers, animações e integração com React Native via postMessage.
// usadas pelo host React Native e por fluxos realtime/dead reckoning.
export function buildMapWebViewScript(params: {
  latInicial: number;
  lngInicial: number;
  estilosJS: string;
  filtrosMapaJS: string;
  estiloMapaPadrao: string;
}) {
  const { latInicial, lngInicial, estilosJS, filtrosMapaJS, estiloMapaPadrao } =
    params;
  return `
var map,userMarker;
var linesSourceId='lines-source',linesSolidLayerId='lines-solid',linesDashLayerId='lines-dash';
var trafficSourceId='traffic-source',trafficLayerId='traffic-layer';
var poiLineSourceId='poi-line-source',poiLineLayerId='poi-line-layer';
var stopMarkersByKey={},stopCache=[],stopCacheKey='',poiMarker=null,poiDistanceMarker=null;
var estilos=[${estilosJS}];
var filtrosMapa={${filtrosMapaJS}};
var currentStyleId='${estiloMapaPadrao}';
var isDark=false;
var vehicleMarkers={},vehicleHeadings={},vehiclePopups={},animFrames={},drState={},vehicleIndexByOrder={};
var autoFollow=true,internalMove=false;
var mapReady=false;
var drInterval=null;
var lastDrLog=0;
var userLastUpdate=0;
var railRuns={},railMarkers={},railHeadings={},railAnimation=null,railLastFrame=0,railLastUiTick=0;
var activeRailPopup=null,activeRailPopupIdentity=null,activeRailPopupSignature=null;
var lastMapData=null;
var realtimeMetric={updates:0,snapshot:0,created:0,updated:0,removed:0};

var railBranchColors={
  'santa cruz':'#64a70b','deodoro':'#ba0c2f','japeri':'#92c1e9',
  'saracuruna':'#de7c00','belford roxo':'#5c068c','paracambi':'#00a3e0',
  'guapimirim':'#f1b500','vila inhomirim':'#c4b000'
};
function railVisual(run){
  var name=(run.lineName||'').toLowerCase(),color='#59636e';
  Object.keys(railBranchColors).some(function(key){if(name.indexOf(key)>=0){color=railBranchColors[key];return true}return false});
  var status=run.operationalStatus||'Estimated';
  return{color:color,status:status,opacity:status==='Scheduled'?.72:status==='Estimated'?.88:1};
}
function applyRailMarkerVisual(el,run){
  var visual=railVisual(run);
  el.classList.remove('rail-status-live','rail-status-estimated','rail-status-scheduled');
  el.classList.add('rail-status-'+visual.status.toLowerCase());
  el.style.opacity=visual.opacity;
  var blob=el.querySelector('.bus-blob');if(blob)blob.style.background=visual.color;
}
function railMarkerElement(run,identity){
  // Preserve the original rail marker: .train-marker > .bus-inner > .bus-blob.
  var visual=railVisual(run),el=busIcon(visual.color,0,'trem');
  el.setAttribute('data-rail-id',identity);
  applyRailMarkerVisual(el,run);
  el.addEventListener('click',function(event){
    event.preventDefault();event.stopPropagation();
    var current=railRuns[identity];
    if(current){var d=railDistanceNow(current,Date.now()),c=railCoordinateAtDistance(current._geometry,d);if(c)openRailPopup(current,c)}
  });
  return el;
}

function railHaversine(a,b){
  var r=6371008.8,toRad=Math.PI/180;
  var lat1=a[1]*toRad,lat2=b[1]*toRad,dLat=lat2-lat1,dLng=(b[0]-a[0])*toRad;
  var h=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)*Math.sin(dLng/2);
  return 2*r*Math.asin(Math.min(1,Math.sqrt(h)));
}

function prepareRailGeometry(coords){
  var cumulative=[0],segments=[],total=0;
  for(var i=1;i<coords.length;i++){var d=railHaversine(coords[i-1],coords[i]);segments.push(d);total+=d;cumulative.push(total)}
  return{coords:coords,segments:segments,cumulative:cumulative,total:total};
}

function railCoordinateAtDistance(g,distance){
  if(!g||!g.coords.length)return null;
  if(distance<=0)return g.coords[0];
  if(distance>=g.total)return g.coords[g.coords.length-1];
  var low=0,high=g.segments.length-1;
  while(low<high){var mid=Math.floor((low+high)/2);if(g.cumulative[mid+1]<distance)low=mid+1;else high=mid}
  var length=g.segments[low],ratio=length>0?(distance-g.cumulative[low])/length:0,a=g.coords[low],b=g.coords[low+1];
  return[a[0]+ratio*(b[0]-a[0]),a[1]+ratio*(b[1]-a[1])];
}

function railBearing(a,b){
  if(!a||!b)return null;
  var toRad=Math.PI/180,lat1=a[1]*toRad,lat2=b[1]*toRad,dLng=(b[0]-a[0])*toRad;
  var y=Math.sin(dLng)*Math.cos(lat2);
  var x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLng);
  if(Math.abs(x)<1e-12&&Math.abs(y)<1e-12)return null;
  return(Math.atan2(y,x)/toRad+360)%360;
}

function railHeadingAtDistance(g,distance){
  if(!g||g.total<=0)return null;
  var delta=Math.min(20,Math.max(3,g.total*.001));
  var before=railCoordinateAtDistance(g,Math.max(0,distance-delta));
  var after=railCoordinateAtDistance(g,Math.min(g.total,distance+delta));
  return railBearing(before,after);
}

function applyRailHeading(marker,key,run,distance){
  var heading=railHeadingAtDistance(run&&run._geometry,distance);
  if(typeof heading==='number'&&isFinite(heading))railHeadings[key]=heading;
  else heading=railHeadings[key];
  if(typeof heading==='number')setHeading(marker,heading);
}

function railDistanceNow(run,now){
  var authoritative;
  if(run.state!=='InSegment')authoritative=run.distanceAtReferenceMetres;
  else if(now>Date.parse(run.freshUntilUtc))authoritative=typeof run._lastDistance==='number'?run._lastDistance:run.distanceAtReferenceMetres;
  else{
  var reference=Date.parse(run.referenceTimeUtc),target=Date.parse(run.targetTimeUtc);
    if(!isFinite(reference)||!isFinite(target)||target<=reference)authoritative=run.distanceAtReferenceMetres;
    else{
      var progress=Math.max(0,Math.min(1,(now-reference)/(target-reference)));
      var eased=progress*progress*(3-2*progress);
      authoritative=run.distanceAtReferenceMetres+eased*(run.targetDistanceMetres-run.distanceAtReferenceMetres);
    }
  }
  if(typeof run._visualStartDistance==='number'&&now<run._visualBlendUntil){
    var blend=Math.max(0,Math.min(1,(now-run._visualReceivedAt)/(run._visualBlendUntil-run._visualReceivedAt)));
    blend=blend*blend*(3-2*blend);
    authoritative=run._visualStartDistance+blend*(authoritative-run._visualStartDistance);
  }
  run._lastDistance=authoritative;
  return authoritative;
}

function setRailRuns(values){
  var next={};
  var receivedAt=Date.now();
  (values||[]).forEach(function(run){
    var coords=run.geometry&&run.geometry.coordinates;
    var identity=run.idVisual||run.railVehicleId||run.railRunId;
    if(!identity||!Array.isArray(coords)||coords.length<2)return;
    var prepared=prepareRailGeometry(coords),previous=railRuns[identity];
    if(prepared.total>0&&run.targetDistanceMetres>prepared.total*1.05){
      console.warn('[Rail] backend distance exceeds frontend geometry length',identity,run.targetDistanceMetres,prepared.total);
    }
    var nextRun={...run,_geometry:prepared};
    if(previous&&previous.padraoVersaoId===run.padraoVersaoId){
      var rendered=railDistanceNow(previous,receivedAt);
      nextRun._lastDistance=rendered;
      nextRun._visualStartDistance=rendered;
      nextRun._visualReceivedAt=receivedAt;
      nextRun._visualBlendUntil=receivedAt+1200;
    }
    next[identity]=nextRun;
  });
  railRuns=next;
}

function updateRailVehicles(now){
  var source=map&&map.getSource('rail-vehicles');if(!source||!source.setData)return;
  var features=[];
  Object.keys(railRuns).forEach(function(key){
    var run=railRuns[key],distance=railDistanceNow(run,now),coord=railCoordinateAtDistance(run._geometry,distance);
    if(!coord)return;
    var marker=railMarkers[key];
    if(!marker){marker=new maplibregl.Marker({element:railMarkerElement(run,key),anchor:'center'}).setLngLat(coord).addTo(map);railMarkers[key]=marker}
    else{marker.setLngLat(coord);applyRailMarkerVisual(marker.getElement(),run)}
    applyRailHeading(marker,key,run,distance);
    if(activeRailPopupIdentity===key)openRailPopup(run,coord);
    features.push({type:'Feature',id:key,geometry:{type:'Point',coordinates:coord},properties:{
      railRunId:key,trainCode:run.trainCode||'',destination:run.destination||'',state:run.state,
      trainType:run.trainType||'',platform:run.platform||'',statusFonte:run.statusFonte||'Indisponível',
      lastRealtimeEvidenceUtc:run.lastRealtimeEvidenceUtc||'',
      positionSource:run.positionSource||'',positionQuality:run.positionQuality||'',
      isEstimated:true,isClamped:Boolean(run.isClamped),stale:now>Date.parse(run.freshUntilUtc)
    }});
  });
  Object.keys(railMarkers).forEach(function(key){if(!railRuns[key]){railMarkers[key].remove();delete railMarkers[key];delete railHeadings[key]}});
  if(now-railLastUiTick>=1000){
    document.querySelectorAll('[data-rail-evidence]').forEach(function(el){el.textContent='Atualizado '+railElapsed(el.getAttribute('data-rail-evidence'))});
    document.querySelectorAll('[data-rail-departure]').forEach(function(el){var at=Date.parse(el.getAttribute('data-rail-departure')),s=Math.max(0,Math.ceil((at-now)/1000));el.textContent=s===0?'Saindo agora':'Saída em '+Math.max(1,Math.ceil(s/60))+' min'});
    railLastUiTick=now;
  }
  source.setData({type:'FeatureCollection',features:features});
}

function openRailPopup(run,coord){
  if(!run||!coord)return;
  var identity=run.idVisual||run.railVehicleId||run.railRunId;
  var status=run.statusFonte||({Live:'Ao vivo',Estimated:'Estimado',Scheduled:'Programado'}[run.operationalStatus]||'Indisponível');
  var statusClass=status==='Ao vivo'?'live':status==='Estimado'?'estimated':'scheduled';
  var title=run.lineName||'Trem';
  var service=run.trainType?String(run.trainType).trim():'';
  var platform=run.platformLabel||run.platform;
  var heading=title+(service?' • '+service:'');
  var destination=run.destinationName&&!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(run.destinationName)?run.destinationName:null;
  var departure=run.secondsToDeparture;
  var primary='';
  if(run.isAtOriginTerminal){primary=departure===0?'Saindo agora':typeof departure==='number'?'Saída em '+Math.max(1,Math.ceil(departure/60))+' min':'No terminal'}
  else if(run.nextStationName){primary='Próxima: '+run.nextStationName+(typeof run.secondsToNextStation==='number'?' · '+Math.max(1,Math.ceil(run.secondsToNextStation/60))+' min':'')}
  var railSeconds=typeof run.secondsToNextStation==='number'?run.secondsToNextStation:
    (isFinite(Date.parse(run.targetTimeUtc))?Math.max(0,(Date.parse(run.targetTimeUtc)-Date.now())/1000):null);
  var railMinutes=railSeconds===null?'':Math.max(1,Math.ceil(railSeconds/60))+' min';
  var railDistance=(typeof run.targetDistanceMetres==='number'&&typeof run.distanceAtReferenceMetres==='number')
    ?Math.max(0,run.targetDistanceMetres-run.distanceAtReferenceMetres):null;
  var railDistanceLabel=railDistance===null?'-':railDistance>=1000?(railDistance/1000).toFixed(1).replace('.',',')+' km':Math.round(railDistance)+' m';
  var railDetailsId='rail_details_'+safeId(identity);
  var html='<div class="popup-card"><div class="popup-header"><div class="popup-indicator" style="--c:'+railVisual(run).color+'">'+modalIconSvg('trem')+'</div><div class="popup-main">'+
    '<div class="popup-title-row"><div class="popup-title">'+escapeHtml(heading)+'</div><span class="rail-status-badge '+statusClass+'">'+escapeHtml(status)+'</span>'+
    (platform?'<span class="popup-platform">'+escapeHtml(platform)+'</span>':'')+'</div>'+
    (destination?'<div class="popup-sub">Sentido: '+escapeHtml(destination)+'</div>':'')+
    (run.lastRealtimeEvidenceUtc&&status!=='Programado'?'<span class="popup-time" data-rail-evidence="'+escapeHtml(run.lastRealtimeEvidenceUtc)+'">Atualizado '+railElapsed(run.lastRealtimeEvidenceUtc)+'</span>':'')+
    (run.trainCode?'<span class="popup-train-code">'+escapeHtml(run.trainCode)+'</span>':'')+'</div></div>'+
    '<div class="popup-toggle" data-target="'+railDetailsId+'" onclick="toggleDetails(this)"><span class="toggle-label">Mais detalhes</span><span class="toggle-chevron"></span></div>'+
    '<div class="popup-details" id="'+railDetailsId+'"><div class="popup-stats">'+
    '<div class="popup-stat"><i data-lucide="clock-3"></i><div class="popup-stat-value">'+escapeHtml(run.isAtOriginTerminal&&typeof departure==='number'?Math.max(1,Math.ceil(departure/60))+' min':railMinutes)+'</div><div class="popup-stat-label">Tempo estimado</div></div>'+
    '<div class="popup-stat"><i data-lucide="map-pin"></i><div class="popup-stat-value">'+escapeHtml(railDistanceLabel)+'</div><div class="popup-stat-label">Distância</div></div>'+
    '<div class="popup-stat"><i data-lucide="flag"></i><div class="popup-stat-value">'+escapeHtml(run.nextStationName||destination||'-')+'</div><div class="popup-stat-label">Próxima estação</div></div></div>'+
    (status==='Programado'?'<div class="popup-time">Viagem prevista pela grade e ainda não confirmada em tempo real.</div>':'')+'</div></div>';
  var signature=[status,title,destination,primary,run.platformLabel||run.platform||'',run.lastRealtimeEvidenceUtc||'',run.trainCode||''].join('|');
  if(activeRailPopup&&activeRailPopupIdentity===identity){
    activeRailPopup.setLngLat(coord);
    if(activeRailPopupSignature!==signature){activeRailPopup.setHTML(html);activeRailPopupSignature=signature}
    return;
  }
  if(activeRailPopup)activeRailPopup.remove();
  var popup=new maplibregl.Popup({offset:14,closeButton:false,closeOnClick:true});
  if(popup.on)popup.on('open',refreshIcons);
  activeRailPopup=popup;activeRailPopupIdentity=identity;activeRailPopupSignature=signature;
  if(railMarkers[identity])railMarkers[identity].getElement().classList.add('rail-selected');
  popup.on('close',function(){if(activeRailPopup===popup){
    if(activeRailPopupIdentity&&railMarkers[activeRailPopupIdentity])railMarkers[activeRailPopupIdentity].getElement().classList.remove('rail-selected');
    activeRailPopup=null;activeRailPopupIdentity=null;activeRailPopupSignature=null;
  }});
  popup.setLngLat(coord).setHTML(html).addTo(map);
}

function escapeHtml(value){return String(value).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]})}
function railElapsed(value){var seconds=Math.max(0,Math.floor((Date.now()-Date.parse(value))/1000));if(seconds<5)return'agora';if(seconds<60)return'há '+seconds+'s';var minutes=Math.floor(seconds/60),rest=seconds%60;return'há '+minutes+'min'+(rest?' '+rest+'s':'')}

function startRailAnimation(){
  if(railAnimation)cancelAnimationFrame(railAnimation);
  function frame(ts){
    if(ts-railLastFrame>=75){updateRailVehicles(Date.now());railLastFrame=ts}
    railAnimation=requestAnimationFrame(frame);
  }
  railAnimation=requestAnimationFrame(frame);
}

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
      var velGraus=kmhParaGrausPorSeg(s.velocidade*(s.decelFactor||1));
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

function distanceMeters(a,b){
  var r=111320;
  var avgLat=(a.lat+b.lat)*0.5*Math.PI/180;
  var dx=(a.lng-b.lng)*Math.cos(avgLat);
  var dy=(a.lat-b.lat);
  return Math.sqrt(dx*dx+dy*dy)*r;
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
  // Saltos incompatíveis com movimento contínuo devem corrigir posição, não
  // atravessar visualmente bairros inteiros entre duas amostras.
  if(distanceMeters(start.lat,start.lng,dest.lat,dest.lng)>1500){marker.setLngLat([dest.lng,dest.lat]);return}
  var t0=performance.now();
  function step(ts){
    var p=Math.min((ts-t0)/ms,1);
    var eased=p*p*(3-2*p);
    var lat=start.lat+(dest.lat-start.lat)*eased;
    var lng=start.lng+(dest.lng-start.lng)*eased;
    marker.setLngLat([lng,lat]);
    if(p<1)animFrames[key]=requestAnimationFrame(step);else delete animFrames[key];
  }
  animFrames[key]=requestAnimationFrame(step);
}

// ── busIcon: gera o elemento DOM do marcador de veículo ──────────────────────
// BRT usa formato de máscara (sino com olhos), igual à imagem de referência.
function busIcon(color,heading,modal){
  var el=document.createElement('div');
  var isTrain=(modal||'').toLowerCase()==='trem';
  var isBrt=(modal||'').toLowerCase()==='brt';
  el.className='bus-marker'+(isTrain?' train-marker':'')+(isBrt?' brt-marker':'');
  if(isBrt){
    // Shape: gota com recorte no topo (pinça), rotacionada corretamente
    el.innerHTML='<div class="bus-inner" style="--h:'+(heading||0)+'deg">'+
      '<div class="brt-mask">'+
        '<svg viewBox="0 0 20 30" xmlns="http://www.w3.org/2000/svg">'+
          '<path fill-rule="evenodd" d="'+
            // Gota externa
            'M10 29 C7 29 1 24 1 17 C1 10 5 3 10 1 C15 3 19 10 19 17 C19 24 13 29 10 29 Z '+
            // Recorte interno maior e mais alto — pontas mais longas e separadas
            'M10 2.5 C7.5 4.5 5.5 8 5.5 11 C5.5 13.8 7 15.5 10 15.5 C13 15.5 14.5 13.8 14.5 11 C14.5 8 12.5 4.5 10 2.5 Z'+
          '" fill="'+color+'" stroke="rgba(255,255,255,0.95)" stroke-width="1.8" stroke-linejoin="round"/>'+
        '</svg>'+
      '</div>'+
    '</div>';
  }else{
    el.innerHTML='<div class="bus-inner" style="--h:'+(heading||0)+'deg">'+
                 '<div class="bus-blob" style="background:'+color+'"></div>'+
                 '<div class="bus-arrow"></div></div>';
  }
  return el;
}

function stopIcon(color,modal){
  var el=document.createElement('div');
  var isTrain=(modal||'').toLowerCase()==='trem';
  el.className='stop-marker'+(isTrain?' stop-train':'');
  el.innerHTML='<div class="stop-pin" style="--stop-color:'+color+'"><div class="stop-core"></div></div>';
  return el;
}

function stopKeyFromParada(p,lat,lng){
  if(p&&p.paradaId!=null)return String(p.paradaId);
  if(lat!=null&&lng!=null){
    return Math.round(lat*1e5)+'_'+Math.round(lng*1e5);
  }
  if(p&&p.nome)return safeId(p.nome);
  return null;
}

function hashString(s){
  var h=2166136261;
  for(var i=0;i<s.length;i++){
    h^=s.charCodeAt(i);
    h+= (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24);
  }
  return h>>>0;
}

function stopThinningFactor(zoom,modal){
  if((modal||'').toLowerCase()==='trem'){
    if(zoom>=15)return 1;
    if(zoom>=14)return 2;
    if(zoom>=13)return 3;
    return 9999;
  }
  if(zoom>=15)return 1;
  if(zoom>=14)return 2;
  if(zoom>=13)return 3;
  if(zoom>=12)return 4;
  return 6;
}

function stopOpacityForZoom(zoom,modal){
  if((modal||'').toLowerCase()==='trem'){
    if(zoom>=15)return 0.95;
    if(zoom>=14)return 0.72;
    if(zoom>=13)return 0.5;
    return 0.0;
  }
  if(zoom>=15)return 0.75;
  if(zoom>=14)return 0.6;
  if(zoom>=13)return 0.45;
  if(zoom>=12)return 0.2;
  return 0.0;
}

function stopScaleForZoom(zoom,modal){
  if((modal||'').toLowerCase()==='trem'){
    if(zoom>=15)return 1.28;
    if(zoom>=14)return 1.1;
    if(zoom>=13)return 0.9;
    return 0.65;
  }
  if(zoom>=15)return 1;
  if(zoom>=14)return 0.9;
  if(zoom>=13)return 0.82;
  if(zoom>=12)return 0.75;
  return 0.65;
}

function applyStopStyle(el,zoom,modal){
  if(!el)return;
  el.style.setProperty('--stop-opacity',String(stopOpacityForZoom(zoom,modal)));
  el.style.setProperty('--stop-scale',String(stopScaleForZoom(zoom,modal)));
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
  var bearing=(map&&map.getBearing)?map.getBearing():0;
  var adjusted=heading-bearing;
  if(inner){
    var previous=parseFloat(inner.getAttribute('data-heading-adjusted'));
    if(isFinite(previous)){
      while(adjusted-previous>180)adjusted-=360;
      while(adjusted-previous< -180)adjusted+=360;
    }
    inner.setAttribute('data-heading-adjusted',String(adjusted));
    inner.style.setProperty('--h',adjusted+'deg');
  }
}

function refreshVehicleHeadings(){
  Object.keys(vehicleMarkers).forEach(function(k){
    var h=vehicleHeadings[k];
    if(typeof h==='number')setHeading(vehicleMarkers[k],h);
  });
  Object.keys(railMarkers).forEach(function(k){
    var h=railHeadings[k];
    if(typeof h==='number')setHeading(railMarkers[k],h);
  });
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

function refreshIcons(){
  if(window.lucide&&window.lucide.createIcons){
    window.lucide.createIcons();
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
  if(p.sentidoNome)sentido=p.sentidoNome;
  if(!sentido&&p.padraoVersaoId&&linha&&linha.itinerarioSentidoMap&&linha.itinerarioSentidoMap[p.padraoVersaoId]){
    sentido=linha.itinerarioSentidoMap[p.padraoVersaoId];
  }
  if(!sentido&&p.padraoVersaoId&&linha&&linha.itinerarioSegmentoMap){
    var segIdx=linha.itinerarioSegmentoMap[p.padraoVersaoId];
    if(segIdx===0)sentido='Sentido 1';
    else if(segIdx===1)sentido='Sentido 2';
  }
  if(sentido&&linha&&linha.nome&&sentido===linha.nome)sentido=null;
  if(!sentido&&linha&&linha.modoSentido){
    if(linha.modoSentido==='ida')sentido='Sentido 1';
    else if(linha.modoSentido==='volta')sentido='Sentido 2';
    else if(linha.modoSentido==='ambos')sentido='Todos os sentidos';
  }
  var sentidoLabel=sentido||'-';
  var color=linha.cor||null;
  var corFinal=color||'#2196F3';
  var headingDeg=typeof heading==='number'?heading:0;
  var popupId='popup_'+safeId(linha.nome+'_'+vid);
  var detailsId=popupId+'_details';
  var tempoHtml=tsMs?('<span class="ts-ago" data-ts="'+tsMs+'">'+formatElapsed(tsMs)+'</span>'):'-';
  var ordemRaw=p.ordem!=null?p.ordem:(p.id!=null?p.id:(p.codigo!=null?p.codigo:null));
  var ordemLabel=ordemRaw!=null?String(ordemRaw):'-';
  var speedHtml=speed!==null?Math.round(speed)+' km/h':'-';
  var prox=p.proximaParadaNome?p.proximaParadaNome:'-';
  var dist=p.distanciaProximaParadaMetros!=null?Math.round(p.distanciaProximaParadaMetros)+' m':'-';
  var iconSvg=modalIconSvg(linha.modal);
  var roadStats='';
  if(speed!==null)roadStats+='<div class="popup-stat"><i data-lucide="gauge"></i><div class="popup-stat-value">'+speedHtml+'</div><div class="popup-stat-label">Velocidade</div></div>';
  if(p.distanciaProximaParadaMetros!=null)roadStats+='<div class="popup-stat"><i data-lucide="map-pin"></i><div class="popup-stat-value">'+dist+'</div><div class="popup-stat-label">Distância</div></div>';
  if(p.proximaParadaNome)roadStats+='<div class="popup-stat"><i data-lucide="bus-front"></i><div class="popup-stat-value">'+escapeHtml(prox)+'</div><div class="popup-stat-label">Próxima parada</div></div>';
  var html='<div class="popup-card" id="'+popupId+'">';
  html+='<div class="popup-header">';
  html+='<div class="popup-indicator" style="--c:'+corFinal+'">'+iconSvg+'</div>';
  html+='<div class="popup-main">';
  html+='<div class="popup-title-row"><div class="popup-title">'+escapeHtml(linha.nome)+'</div><span class="popup-vehicle" style="--c:'+corFinal+'">'+escapeHtml(ordemLabel)+'</span></div>';
  html+='<div class="popup-sub">'+escapeHtml(linha.descricao||('Sentido: '+sentidoLabel))+'</div>';
  html+='</div>';
  html+='</div>';
  html+='<div class="popup-meta"><span class="popup-status">Ao vivo</span><span class="popup-time">Atualizado há '+tempoHtml+'</span></div>';
  html+='<div class="popup-toggle" data-target="'+detailsId+'" onclick="toggleDetails(this)">'+
        '<span class="toggle-label">Mais detalhes</span><span class="toggle-chevron"></span></div>';
  html+='<div class="popup-details" id="'+detailsId+'">';
  html+='<div class="popup-stats">'+roadStats+'</div>';
  html+='</div>';
  html+='</div>';
  return html;
}

function buildStopPopup(parada,modal){
  var nome=(parada&&parada.nome)?parada.nome:'Parada';
  var ordem=(parada&&parada.ordem!=null)?('Parada #'+parada.ordem):'';
  var html='<div class="stop-popup"><div class="stop-popup-icon"><i data-lucide="'+((modal||'').toLowerCase()==='trem'?'train-front':'bus-front')+'"></i></div><div class="stop-popup-copy">';
  html+='<div class="stop-title">'+escapeHtml(nome)+'</div>';
  if(ordem)html+='<div class="stop-sub">'+escapeHtml(ordem)+'</div>';
  html+='</div><div class="stop-chevron">›</div></div>';
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
    map.addLayer({id:linesDashLayerId,type:'line',source:linesSourceId,filter:['==',['get','dash'],1],paint:{'line-color':['get','color'],'line-width':['get','width'],'line-opacity':0.9,'line-blur':0.2,'line-dasharray':[2.2,1.4]}});
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

function stopSignature(linhas,darkMode){
  var parts=[darkMode?'d1':'d0'];
  if(!Array.isArray(linhas))return parts.join('|');
  for(var i=0;i<linhas.length;i++){
    var l=linhas[i];
    if(!l||!l.mostrarParadas||!Array.isArray(l.paradas))continue;
    parts.push((l.nome||'')+':'+l.paradas.length+':'+(l.cor||''));
  }
  return parts.join('|');
}

function rebuildStopCache(linhas,darkMode){
  var list=[];
  var seen={};
  if(!Array.isArray(linhas)){
    stopCache=list;
    return;
  }
  for(var i=0;i<linhas.length;i++){
    var l=linhas[i];
    if(!l||!l.mostrarParadas||!Array.isArray(l.paradas))continue;
    var color=l.cor||(darkMode?'#4FC3F7':'#2196F3');
    for(var j=0;j<l.paradas.length;j++){
      var p=l.paradas[j];
      var lat=parseNum(p.latitude),lng=parseNum(p.longitude);
      if(lat===null||lng===null)continue;
      var key=stopKeyFromParada(p,lat,lng);
      if(!key||seen[key])continue;
      seen[key]=true;
      list.push({key:key,parada:p,lat:lat,lng:lng,color:color,modal:l.modal||'onibus'});
    }
  }
  stopCache=list;
}

function updateStopMarkers(){
  if(!map)return;
  if(!stopCache||stopCache.length===0){
    if(Object.keys(stopMarkersByKey).length>0)clearStops();
    return;
  }
  var bounds=map.getBounds();
  var zoom=map.getZoom();
  var thinFactors={};
  var visible={};

  function inBounds(lat,lng){
    if(!bounds||!bounds.contains)return true;
    return bounds.contains([lng,lat]);
  }

  function ensureStopMarker(stop){
    var key='s:'+stop.key;
    var existing=stopMarkersByKey[key];
    if(existing&&existing.marker){
      existing.marker.setLngLat([stop.lng,stop.lat]);
      if(existing.el)applyStopStyle(existing.el,zoom,stop.modal);
      visible[key]=true;
      return;
    }
    var el=stopIcon(stop.color,stop.modal);
    applyStopStyle(el,zoom,stop.modal);
    var marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([stop.lng,stop.lat]);
    var popup=new maplibregl.Popup({offset:16,closeButton:false}).setHTML(buildStopPopup(stop.parada,stop.modal));
    if(popup.on)popup.on('open',refreshIcons);
    marker.setPopup(popup);
    el.addEventListener('click',function(){
      if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'stop_click',parada:stop.parada}));
      }
    });
    marker.addTo(map);
    stopMarkersByKey[key]={marker:marker,el:el,isCluster:false};
    visible[key]=true;
  }

  for(var j=0;j<stopCache.length;j++){
    var s2=stopCache[j];
    if(!inBounds(s2.lat,s2.lng))continue;
    var tf=thinFactors[s2.modal];
    if(tf==null){tf=stopThinningFactor(zoom,s2.modal);thinFactors[s2.modal]=tf;}
    if(tf>1){
      var h=hashString(String(s2.key));
      if(h%tf!==0)continue;
    }
    ensureStopMarker(s2);
  }

  Object.keys(stopMarkersByKey).forEach(function(k){
    if(!visible[k]){
      stopMarkersByKey[k].marker.remove();
      delete stopMarkersByKey[k];
    }
  });
}

function clearStops(){
  Object.keys(stopMarkersByKey).forEach(function(k){
    stopMarkersByKey[k].marker.remove();
    delete stopMarkersByKey[k];
  });
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

  refreshIcons();
}

function normEstilo(id){
  return(typeof id==='string'&&estilos.indexOf(id)>=0)?id:'${estiloMapaPadrao}';
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

function updateUser(data){
  if(!data||!data.userLocation||!userMarker||!map)return;
  var lat=parseNum(data.userLocation[0]),lng=parseNum(data.userLocation[1]);
  if(lat===null||lng===null)return;
  var pos={lat:lat,lng:lng};
  var cur=userMarker.getLngLat();
  var distM=distanceMeters({lat:cur.lat,lng:cur.lng},pos);
  var accuracy=parseNum(data.accuracy);
  var now=Date.now();
  var dt=userLastUpdate?now-userLastUpdate:0;
  userLastUpdate=now;
  var followMs=450;
  if(distM>1500){
    stopAnim('user');
    userMarker.setLngLat([pos.lng,pos.lat]);
  }else{
    var minMs=250,maxMs=1200;
    var animMs=300+distM*8;
    if(dt>0)animMs=Math.max(animMs,dt*0.7);
    if(accuracy!==null){
      if(accuracy>40)animMs*=1.25;
      else if(accuracy<15)animMs*=0.85;
    }
    animMs=Math.max(minMs,Math.min(maxMs,Math.round(animMs)));
    animateTo('user',userMarker,pos,animMs);
    followMs=Math.min(700,animMs);
  }

  var arrow=document.querySelector('.user-arrow');
  if(arrow){
    var h=normHeading(data.heading);
    if(h!==null){
      var bearing=(map&&map.getBearing)?map.getBearing():0;
      arrow.style.display='block';
      arrow.style.setProperty('--h',(h-bearing)+'deg');
    }
    else arrow.style.display='none';
  }

  if(autoFollow)runInternal(function(){map.easeTo({center:[pos.lng,pos.lat],duration:followMs})});
}

function focusOnVehicle(payload){
  if(!map||!payload)return;
  var target=null;
  var railIdentity=payload.idVisual||
    (payload.railVehicleId?'rail:'+payload.railVehicleId:null)||
    (payload.railRunId?'rail:'+payload.railRunId:null);
  if(railIdentity&&railRuns[railIdentity]){
    var railRun=railRuns[railIdentity];
    var railCoord=railCoordinateAtDistance(railRun._geometry,railDistanceNow(railRun,Date.now()));
    if(railCoord){target={lat:railCoord[1],lng:railCoord[0]};openRailPopup(railRun,railCoord)}
  }
  var ordem=payload.ordem||payload.id||null;
  if(ordem&&vehicleIndexByOrder[ordem]&&vehicleMarkers[vehicleIndexByOrder[ordem]]){
    var key=vehicleIndexByOrder[ordem];
    var marker=vehicleMarkers[key];
    var lngLat=marker.getLngLat();
    target={lat:lngLat.lat,lng:lngLat.lng};
    var popup=vehiclePopups[key]||(marker.getPopup&&marker.getPopup());
    if(popup){
      if(popup.isOpen&&popup.isOpen()){
        // ja aberto
      }else if(popup.addTo){
        popup.addTo(map);
        refreshIcons();
      }
    }
  }
  if(!target){
    var lat=parseNum(payload.latitude),lng=parseNum(payload.longitude);
    if(lat!==null&&lng!==null)target={lat:lat,lng:lng};
  }
  if(!target)return;
  autoFollow=false;
  var z=parseNum(payload.zoom);
  var zoom=z!==null?z:17;
  runInternal(function(){map.easeTo({center:[target.lng,target.lat],zoom:zoom,duration:700})});
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
    if(!map.getSource('rail-vehicles'))map.addSource('rail-vehicles',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    if(!map.getLayer('rail-vehicles-layer'))map.addLayer({id:'rail-vehicles-layer',type:'circle',source:'rail-vehicles',paint:{
      'circle-radius':16,'circle-opacity':0
    }});
    map.on('click','rail-vehicles-layer',function(e){
      var feature=e.features&&e.features[0];if(!feature)return;
      var key=feature.properties&&feature.properties.railRunId;
      var run=key&&railRuns[key];
      if(run)openRailPopup(run,feature.geometry.coordinates);
    });
    map.on('mouseenter','rail-vehicles-layer',function(){map.getCanvas().style.cursor='pointer'});
    map.on('mouseleave','rail-vehicles-layer',function(){map.getCanvas().style.cursor=''});
    userMarker=new maplibregl.Marker({element:userIcon(),anchor:'center'}).setLngLat([${lngInicial},${latInicial}]).addTo(map);
    setMapStyle('${estiloMapaPadrao}');
    setDark(false);

    map.on('movestart',function(){if(!internalMove)autoFollow=false});
    map.on('zoomstart',function(){if(!internalMove)autoFollow=false});
    map.on('moveend',function(){internalMove=false;updateStopMarkers()});
    map.on('zoomend',function(){internalMove=false;updateStopMarkers()});
    map.on('rotate',function(){refreshVehicleHeadings()});

    startDR();
    startRailAnimation();
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
  runInternal(function(){map.flyTo({center:[pos.lng,pos.lat],zoom:17,bearing:0,pitch:0})});
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
  var structuralUpdate=!data.realtimeOnly;
  if(structuralUpdate)lastMapData=data;

  setMapStyle(data.estiloMapa);
  setDark(Boolean(data.darkMode));
  setTraffic(Boolean(data.showTraffic));
  setLineOpacity(Boolean(data.darkMode));

  if(data.userLocation)updateUser(data);
  setRailRuns(data.railVehicles||[]);

  var lineFeatures=[];
  vehicleIndexByOrder={};

  if(!Array.isArray(data.linhas)||data.linhas.length===0){
    if(structuralUpdate)setLinesData(lineFeatures);
    clearVehicles();
    stopCache=[];
    stopCacheKey='';
    clearStops();
    return;
  }

  var stopSig=structuralUpdate?stopSignature(data.linhas,Boolean(data.darkMode)):stopCacheKey;
  if(structuralUpdate&&stopSig!==stopCacheKey){
    stopCacheKey=stopSig;
    rebuildStopCache(data.linhas,Boolean(data.darkMode));
    clearStops();
    updateStopMarkers();
  }

  var visibleKeys={};
  var createdNow=0,updatedNow=0,removedNow=0,snapshotNow=0;

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
      if(structuralUpdate)lineFeatures.push({
        type:'Feature',
        geometry:{type:'LineString',coordinates:coords},
        properties:{color:color,dash:(linha.modal||'').toLowerCase()==='trem'?1:(idx===1?1:0),width:(linha.modal||'').toLowerCase()==='trem'?4.8:(idx===1?3:4)}
      });
    });

    if(!Array.isArray(linha.posicoes))return;

    linha.posicoes.forEach(function(p,idx){
      var lat=parseNum(p.latitude!=null?p.latitude:p.lat);
      var lng=parseNum(p.longitude!=null?p.longitude:p.lng);
      if(lat===null||lng===null)return;

      var rawId=p.id||p.codigo||p.ordem;
      var vid=rawId?String(rawId).trim():linha.nome+'-'+idx;
      var vKey=(linha.modal||'m')+':'+linha.nome+':'+vid;
      visibleKeys[vKey]=true;
      snapshotNow++;
      vehicleIndexByOrder[vid]=vKey;

      var dest={lat:lat,lng:lng};
      var heading=normHeading(p.direcao);
      var prevHeading=vehicleHeadings[vKey];

      var posicaoNaRota=parseNum(p.posicaoNaRota);
      var comprimentoMetros=parseNum(p.comprimentoRotaMetros);
      var velocidade=parseNum(p.velocidadeMedia!=null?p.velocidadeMedia:p.velocidade);
      var distStop=parseNum(p.distanciaProximaParadaMetros);
      var decelFactor=(distStop!==null&&distStop<300)?Math.max(0.72,0.95-(300-distStop)/1200):1;

      // Escolhe a geometria pela identidade estrutural oficial da versão.
      var lineCoordsDR=segmentos[0]||null;
      if(p.padraoVersaoId&&linha.itinerarioSegmentoMap){
        var segIdx=linha.itinerarioSegmentoMap[p.padraoVersaoId];
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
        var el=busIcon(color,heading||0,linha.modal);
        marker=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([posInicial.lng,posInicial.lat]);
        popup=new maplibregl.Popup({offset:18,closeButton:false}).setHTML(buildPopup(linha,p,vid,heading));
        if(popup.on)popup.on('open',refreshIcons);
        marker.setPopup(popup);
        marker.addTo(map);
        vehicleMarkers[vKey]=marker;
        createdNow++;
        vehiclePopups[vKey]=popup;
        if(typeof heading==='number')vehicleHeadings[vKey]=heading;
        drState[vKey]={
          marker:marker,
          posicaoNaRota:posicaoNaRota,
          comprimentoGraus:null,
          velocidade:velocidade,
          decelFactor:decelFactor,
          lineCoords:lineCoordsDR,
          syncingUntil:0
        };
        return;
      }
      updatedNow++;

      var markerEl=marker.getElement();
      if(markerEl){
        var blob=markerEl.querySelector('.bus-blob');
        if(blob)blob.style.background=color;
        // Atualiza cor do BRT (SVG path fill)
        var brtPath=markerEl.querySelector('.brt-mask path');
        if(brtPath)brtPath.setAttribute('fill',color);
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

      // Sincroniza posicao na rota sem recuar o marcador
      var hasPosicao=posicaoNaRota!==null;
      var acceptedPosicao=false;
      if(hasPosicao){
        var drPos=(typeof dr.posicaoNaRota==='number')?dr.posicaoNaRota:null;
        var allowRewind=drPos!==null&&posicaoNaRota<drPos-0.15;
        if(drPos===null||posicaoNaRota>=drPos||allowRewind){
          acceptedPosicao=true;
          dr.posicaoNaRota=posicaoNaRota;
        }
      }else{
        dr.posicaoNaRota=null;
      }
      if(comprimentoMetros!==null)dr.comprimentoMetros=comprimentoMetros;
      if(velocidade!==null)dr.velocidade=velocidade;
      dr.decelFactor=decelFactor;

      // Reposiciona o marcador na rota interpolada (sincronizacao com servidor)
      if(acceptedPosicao){
        var syncMs=700;
        var target=null;
        if(lineCoordsDR){
          var coordDR=interpolarNaRota(lineCoordsDR,dr.posicaoNaRota);
          if(coordDR)target={lat:coordDR[0],lng:coordDR[1]};
        }
        if(!target)target=dest;
        dr.syncingUntil=Date.now()+syncMs;
        animateTo(vKey,marker,target,syncMs);
      }else if(!hasPosicao){
        // Fallback: sem posicaoNaRota, usa animacao linear simples
        animateTo(vKey,marker,dest,1600);
      }

      if(popup){
        popup.setHTML(buildPopup(linha,p,vid,heading));
        if(popup.isOpen&&popup.isOpen())refreshIcons();
      }
    });
  });

  if(structuralUpdate)setLinesData(lineFeatures);

  // Remove veículos que não vieram neste update
  Object.keys(vehicleMarkers).forEach(function(k){
    if(!visibleKeys[k]){
      stopAnim(k);
      vehicleMarkers[k].remove();
      if(vehiclePopups[k])vehiclePopups[k].remove();
      delete vehicleMarkers[k];delete vehicleHeadings[k];delete drState[k];delete vehiclePopups[k];
      removedNow++;
    }
  });

  refreshIcons();
  if(!structuralUpdate){
    realtimeMetric.updates++;realtimeMetric.snapshot=snapshotNow;
    realtimeMetric.created+=createdNow;realtimeMetric.updated+=updatedNow;realtimeMetric.removed+=removedNow;
    if(realtimeMetric.updates%25===0&&window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'realtime_metrics',metrics:realtimeMetric}));
      realtimeMetric={updates:0,snapshot:0,created:0,updated:0,removed:0};
    }
  }
};

window.updateRealtime=function(data){
  if(!lastMapData){return}
  var updates={};
  (data.linhas||[]).forEach(function(linha){updates[linha.structureKey||((linha.modal||'')+':'+linha.nome)]=linha.posicoes||[]});
  var linhas=(lastMapData.linhas||[]).map(function(linha){
    var key=linha.structureKey||((linha.modal||'')+':'+linha.nome);
    return Object.assign({},linha,{posicoes:updates[key]||[]});
  });
  window.updateMap(Object.assign({},lastMapData,{linhas:linhas,
    railVehicles:data.railVehicles||[],realtimeOnly:true}));
};

window.updateUser=updateUser;
window.focusOnVehicle=focusOnVehicle;
`;
}
