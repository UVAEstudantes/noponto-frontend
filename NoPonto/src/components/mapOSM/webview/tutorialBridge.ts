// Runs in the existing map runtime; only an active request installs observation.
export const TUTORIAL_MAP_BRIDGE = `
var tutorialRequest=null,tutorialTimer=null,tutorialFrame=null,tutorialLastSent=0,tutorialVehicleId=null,tutorialCameraMoved=false,tutorialSequence=0,tutorialLastPost='',tutorialAccessible=null,tutorialObservers=[],tutorialObserved=null;
var tutorialHighlightedElement=null,tutorialPopup=null;
function tutorialNativeHighlight(){return !!(tutorialRequest&&tutorialRequest.nativeHighlight)}
function tutorialHighlight(element){
  if(tutorialHighlightedElement!==element){
    if(tutorialHighlightedElement)tutorialHighlightedElement.classList.remove('tutorial-vehicle-focus');
    tutorialHighlightedElement=element;
    if(element)element.classList.add('tutorial-vehicle-focus');
  }
  tutorialDimMap();
}
function tutorialPopupClosed(){
  if(!tutorialNativeHighlight()||tutorialRequest.mode!=='details'||!tutorialPopup||tutorialPopup.isOpen())return;
  tutorialHighlight(null);
  tutorialPost('closed',{id:tutorialVehicleId});
}
function tutorialWatchPopup(popup){
  if(tutorialPopup===popup)return;
  if(tutorialPopup)tutorialPopup.off('close',tutorialPopupClosed);
  tutorialPopup=popup;
  if(popup)popup.on('close',tutorialPopupClosed);
}
function tutorialDimMap(){
  if(!tutorialNativeHighlight()||(!tutorialHighlightedElement&&tutorialRequest.kind!=='route')||!map||!map.getLayer(linesSolidLayerId))return;
  if(!map.getLayer('tutorial-dim'))map.addLayer({id:'tutorial-dim',type:'background',paint:{'background-color':'#000000','background-opacity':0.35}},linesSolidLayerId);
  if(tutorialRequest.kind==='route'&&!map.getLayer('tutorial-route-focus')){
    map.addLayer({id:'tutorial-route-focus',type:'line',source:linesSourceId,filter:['==',['get','lineId'],tutorialRequest.lineId],paint:{'line-color':'#FFC107','line-width':['+',['get','width'],4],'line-opacity':0.85}},linesSolidLayerId);
  }
}
function tutorialClearHighlight(keepDim){
  if(tutorialHighlightedElement)tutorialHighlightedElement.classList.remove('tutorial-vehicle-focus');
  tutorialHighlightedElement=null;
  if(map&&map.getLayer('tutorial-route-focus'))map.removeLayer('tutorial-route-focus');
  if(!keepDim&&map&&map.getLayer('tutorial-dim'))map.removeLayer('tutorial-dim');
}
function tutorialCandidates(){
  if(tutorialRequest&&tutorialRequest.kind==='stop'){
    var line=lastMapData&&lastMapData.linhas&&lastMapData.linhas.find(function(l){return l.linhaId===tutorialRequest.lineId&&l.modal===tutorialRequest.modal});
    var ids=new Set((line&&line.paradas||[]).map(function(p){return p.paradaId}));
    return (typeof stopCache!=='undefined'&&stopCache||[]).filter(function(stop){
      return stop.parada&&stop.parada.paradaId&&ids.has(stop.parada.paradaId)
        &&Number.isFinite(stop.lat)&&Number.isFinite(stop.lng)&&Math.abs(stop.lat)<=90&&Math.abs(stop.lng)<=180;
    }).sort(function(a,b){
      var pa=map.project([a.lng,a.lat]),pb=map.project([b.lng,b.lat]);
      function rank(p){return p.x>=35&&p.x<=window.innerWidth-35&&p.y>=100&&p.y<=window.innerHeight*.55?0:1}
      return rank(pa)-rank(pb)||Number(!a.parada.nome)-Number(!b.parada.nome)||String(a.key).localeCompare(String(b.key));
    }).map(function(stop){return {id:'stop:'+stop.key,stop:stop,marker:stopMarkersByKey['s:'+stop.key]&&stopMarkersByKey['s:'+stop.key].marker,data:{}}});
  }
  var result=[];
  Object.keys(vehicleMarkers).forEach(function(key){var m=vehicleMarkers[key];if(m._tutorial)result.push({id:'road:'+key,marker:m,popup:vehiclePopups[key],data:m._tutorial})});
  Object.keys(railMarkers).forEach(function(key){var run=railRuns[key];if(!run)return;
    result.push({id:'rail:'+key,marker:railMarkers[key],popup:activeRailPopupIdentity===key?activeRailPopup:null,
      data:{lineId:run.linhaId,lineName:run.lineName,modal:'trem',timestamp:Date.parse(run.lastRealtimeEvidenceUtc),demo:run.isDemo||run.source==='demo'||run.trainType==='demo'||run.railVehicleId==='rail-demo-vehicle',
        hasDirection:!!run.destinationName,hasNextStop:!!run.nextStationName,hasDistance:typeof run.targetDistanceMetres==='number',statusText:run.statusFonte||run.operationalStatus||'Indisponível'}})
  });
  Object.keys(physicalMarkers).forEach(function(key){var m=physicalMarkers[key];if(m._tutorial)result.push({id:'physical:'+key,marker:m,popup:m._physicalPopup,data:m._tutorial})});
  return result.filter(function(item){
    var d=item.data,r=tutorialRequest;if(!r||d.demo||d.modal!==r.modal)return false;
    if(d.lineId?d.lineId!==r.lineId:d.lineName!==r.lineName)return false;
    var line=lastMapData&&lastMapData.linhas&&lastMapData.linhas.find(function(l){return l.linhaId===r.lineId});
    if(!line||line.modal!==r.modal)return false;
    // Physical-only evidence without a known direction must not impersonate a selected direction.
    if((item.id.indexOf('physical:')===0||d.ambiguousPhysical)&&line.modoSentido!=='ambos')return false;
    var c=item.marker.getLngLat(),el=item.marker.getElement&&item.marker.getElement();
    return c&&Number.isFinite(c.lat)&&Number.isFinite(c.lng)&&Math.abs(c.lat)<=90&&Math.abs(c.lng)<=180
      &&(!el||el.style.opacity!=='0')&&(!Number.isFinite(d.timestamp)||Date.now()-d.timestamp<=gpsPolicy.publicMs);
  }).sort(function(a,b){return (Number.isFinite(b.data.timestamp)?b.data.timestamp:0)-(Number.isFinite(a.data.timestamp)?a.data.timestamp:0)||a.id.localeCompare(b.id)});
}
function tutorialPost(status,item,rect){
  if(!tutorialRequest||!window.ReactNativeWebView)return;
  var d=item&&item.data||{};
  var signature=JSON.stringify([status,item&&item.id,rect,d.hasDirection,d.hasNextStop,d.hasDistance,d.statusText]);
  if(status==='target'&&signature===tutorialLastPost)return;
  tutorialLastPost=signature;
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'tutorial_vehicle',requestId:tutorialRequest.requestId,status:status,
    sequence:++tutorialSequence,vehicleId:item&&item.id,rect:rect||null,viewport:{width:window.innerWidth,height:window.innerHeight},
    hasDirection:!!d.hasDirection,hasNextStop:!!d.hasNextStop,hasDistance:!!d.hasDistance,statusText:d.statusText||null}));
}
function tutorialRect(element){
  if(!element||!element.getBoundingClientRect)return null;
  var r=element.getBoundingClientRect(),x=Math.max(0,r.left),y=Math.max(0,r.top),right=Math.min(window.innerWidth,r.right),bottom=Math.min(window.innerHeight,r.bottom);
  return right>x&&bottom>y?{x:x,y:y,width:right-x,height:bottom-y}:null;
}
function tutorialMeasure(){
  tutorialFrame=null;
  if(!tutorialRequest||!map)return;
  tutorialLastSent=Date.now();
  if(tutorialRequest.kind==='route'){tutorialDimMap();return;}
  var candidates=tutorialCandidates(),wanted=tutorialRequest.vehicleId||tutorialVehicleId;
  var item=wanted?candidates.find(function(c){return c.id===wanted}):candidates[0];
  if(!item){if(tutorialNativeHighlight()){tutorialWatchPopup(null);tutorialClearHighlight();}tutorialPost('unavailable');return;}
  if(!tutorialVehicleId&&tutorialRequest.mode==='marker'&&item.popup&&item.popup.isOpen&&item.popup.isOpen()&&item.popup.remove)item.popup.remove();
  tutorialVehicleId=item.id;
  if(item.stop&&!item.marker){updateStopMarkers();item.marker=stopMarkersByKey['s:'+item.stop.key]&&stopMarkersByKey['s:'+item.stop.key].marker;}
  var markerElement=item.marker&&item.marker.getElement&&item.marker.getElement();
  if(tutorialNativeHighlight()&&tutorialRequest.mode==='marker')tutorialHighlight(markerElement);
  if(!tutorialAccessible&&markerElement&&markerElement.setAttribute&&markerElement.getAttribute){
    tutorialAccessible={element:markerElement,attrs:['role','tabindex','aria-label'].map(function(name){return[name,markerElement.getAttribute(name)]})};
    markerElement.setAttribute('role','button');markerElement.setAttribute('tabindex','0');
    markerElement.setAttribute('aria-label',(item.stop?'Local de embarque':tutorialRequest.modal==='trem'?'Trem':'Veículo')+' da linha '+tutorialRequest.lineName+'. Toque para ver informações.');
  }
  if(tutorialRequest.mode==='details'){
    if(!item.popup||!item.popup.isOpen||!item.popup.isOpen()){
      if(tutorialNativeHighlight()){tutorialWatchPopup(null);tutorialHighlight(null);}
      tutorialPost('closed',item);return;
    }
    var element=item.popup.getElement&&item.popup.getElement();
    if(tutorialNativeHighlight()){
      tutorialWatchPopup(item.popup);
      tutorialHighlight(element&&(element.querySelector('.maplibregl-popup-content')||element));
      tutorialPost('target',item,null);return;
    }
    tutorialWatch(element);
    tutorialPost('target',item,tutorialPopupRect(element));return;
  }
  var c=item.stop?{lng:item.stop.lng,lat:item.stop.lat}:item.marker.getLngLat(),point=map.project(c);
  var visible=point.x>=35&&point.x<=window.innerWidth-35&&point.y>=100&&point.y<=window.innerHeight*.55;
  if((!visible||map.getZoom()<16)&&!tutorialCameraMoved){
    tutorialCameraMoved=true;autoFollow=false;
    runInternal(function(){map.easeTo({center:[c.lng,c.lat],zoom:Math.max(map.getZoom(),16),duration:tutorialRequest.reducedMotion?0:600,offset:[0,-window.innerHeight*.08]})},'tutorial-vehicle');
  }
  if(tutorialNativeHighlight()){tutorialPost('target',item,null);return;}
  tutorialWatch(markerElement);
  var rect=tutorialRect(markerElement);
  // Layer-based vehicles use MapLibre projection, without DOM marker assumptions.
  if(!item.stop&&!rect&&point.x>=0&&point.y>=0&&point.x<=window.innerWidth&&point.y<=window.innerHeight){
    var x=Math.max(0,point.x-22),y=Math.max(0,point.y-22);
    rect={x:x,y:y,width:Math.min(44,window.innerWidth-x),height:Math.min(44,window.innerHeight-y)};
  }
  tutorialPost('target',item,rect);
}
function tutorialPopupRect(element){
  var content=element&&element.querySelector('.maplibregl-popup-content');
  if(!content)return tutorialRect(element);
  var r=content.getBoundingClientRect();
  return tutorialRect({getBoundingClientRect:function(){return {left:r.left-2,top:r.top-2,right:r.right+2,bottom:r.bottom+2}}});
}
function tutorialWatch(element){
  if(element===tutorialObserved)return;
  tutorialObservers.forEach(function(observer){observer.disconnect()});tutorialObservers=[];tutorialObserved=element;
  if(!element)return;
  if(typeof ResizeObserver!=='undefined'){var resize=new ResizeObserver(tutorialSchedule);resize.observe(element);tutorialObservers.push(resize);}
  if(typeof MutationObserver!=='undefined'){var mutation=new MutationObserver(tutorialSchedule);mutation.observe(element,{attributes:true,childList:true,subtree:true,characterData:true});tutorialObservers.push(mutation);}
}
function tutorialUserMove(event){
  if(tutorialRequest&&!tutorialNativeHighlight()){var item=tutorialCandidates().find(function(candidate){return candidate.id===tutorialVehicleId});tutorialPost(item?'target':'unavailable',item,null);}
  if(event&&event.originalEvent)tutorialCameraMoved=true;
}
function tutorialSchedule(){
  if(!tutorialRequest||tutorialFrame!==null)return;
  tutorialFrame=requestAnimationFrame(tutorialMeasure);
}
function tutorialVehicleClicked(id){
  if(!tutorialRequest||tutorialRequest.mode!=='marker')return;
  var requestId=tutorialRequest.requestId;
  requestAnimationFrame(function(){
    if(!tutorialRequest||tutorialRequest.requestId!==requestId)return;
    var item=tutorialCandidates().find(function(c){return c.id===id});
    if(item&&item.popup&&item.popup.isOpen&&item.popup.isOpen())tutorialPost('selected',item,tutorialNativeHighlight()?null:tutorialRect(item.popup.getElement&&item.popup.getElement()));
  });
}
window.setTutorialVehicle=function(request){
  tutorialWatchPopup(null);
  if(map&&tutorialNativeHighlight()){
    map.off('styledata',tutorialDimMap);
    tutorialClearHighlight(Boolean(request&&request.nativeHighlight&&request.lineId===tutorialRequest.lineId&&request.modal===tutorialRequest.modal));
  }
  if(tutorialAccessible){tutorialAccessible.attrs.forEach(function(pair){if(pair[1]===null)tutorialAccessible.element.removeAttribute(pair[0]);else tutorialAccessible.element.setAttribute(pair[0],pair[1])});tutorialAccessible=null;}
  if(map&&tutorialRequest){map.off('move',tutorialSchedule);map.off('resize',tutorialSchedule);map.off('moveend',tutorialSchedule);map.off('movestart',tutorialUserMove)}
  tutorialWatch(null);
  if(tutorialTimer!==null)clearInterval(tutorialTimer);
  if(tutorialFrame!==null)cancelAnimationFrame(tutorialFrame);
  tutorialTimer=null;tutorialFrame=null;tutorialLastSent=0;tutorialVehicleId=null;tutorialCameraMoved=false;
  tutorialRequest=request;tutorialLastPost='';
  if(!request||!map||!mapReady)return;
  // Vehicle details from the previous chapter must not cover the boarding marker.
  if(request.kind==='stop'){
    Object.keys(vehiclePopups).forEach(function(key){if(vehiclePopups[key].remove)vehiclePopups[key].remove()});
    if(activeRailPopup&&activeRailPopup.remove)activeRailPopup.remove();
    Object.keys(physicalMarkers).forEach(function(key){var popup=physicalMarkers[key]._physicalPopup;if(popup&&popup.remove)popup.remove()});
  }
  if(tutorialNativeHighlight())map.on('styledata',tutorialDimMap);
  else{
    map.on('move',tutorialSchedule);map.on('resize',tutorialSchedule);map.on('moveend',tutorialSchedule);
    tutorialTimer=setInterval(tutorialSchedule,750);
  }
  map.on('movestart',tutorialUserMove);
  tutorialMeasure();
};
`;
