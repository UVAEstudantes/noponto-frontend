// Geometry is [latitude, longitude]. Progress uses the same segment weights as
// the WebView. Metres are measured separately; degrees are never a distance UI.
import type {Parada} from '../types/transporte';
import type {OcorrenciaParadaV2} from '../types/estruturaV2';
export type Projection={gap:number; progress:number; metres:number; totalMetres:number; heading:number; ambiguous?:boolean};
type ProjectedStop={stop:Parada;point:Projection|null};
const preparedStops=new WeakMap<Parada[],WeakMap<[number,number][],{raw:ProjectedStop[];authoritative:ProjectedStop[]}>>();
/** Static route/stop data is immutable, like geometryForMap. Never repeat it per vehicle or clock boundary. */
export function routeStopProjections(coords:[number,number][],stops:Parada[],authoritativeDistances=false):readonly ProjectedStop[]{
  let byGeometry=preparedStops.get(stops);
  if(!byGeometry){byGeometry=new WeakMap();preparedStops.set(stops,byGeometry);}
  let entry=byGeometry.get(coords);
  if(!entry){
    const raw=stops.map(stop=>({stop,point:projectPhysical(coords,stop.latitude,stop.longitude)}));
    const authoritative=raw.map(({stop,point})=>({stop,point:point&&stop.distanciaMetros!=null&&stop.distanciaMetros>=0&&stop.distanciaMetros<=point.totalMetres*1.05?{...point,metres:stop.distanciaMetros,ambiguous:false}:point}));
    const compare=(a:ProjectedStop,b:ProjectedStop)=>(a.point?.metres??Infinity)-(b.point?.metres??Infinity);
    entry={raw:raw.sort(compare),authoritative:authoritative.sort(compare)};byGeometry.set(coords,entry);
  }
  return authoritativeDistances?entry.authoritative:entry.raw;
}
type Segment={a:[number,number];dx:number;dy:number;weight:number;length:number;walked:number;walkedMetres:number};
type Prepared={scale:number;total:number;metres:number;segments:Segment[];grid:Map<string,Segment[]>;long:Segment[];results:Map<string,Projection|null>};
const prepared=new WeakMap<[number,number][],Prepared>();
export const geometryWork = { projections:0, segments:0, cacheHits:0, preparations:0 };
const mappedGeometry=new WeakMap<[number,number][],[number,number][]>();
export function geometryForMap(coords:[number,number][]){
  let result=mappedGeometry.get(coords);
  if(!result){result=coords.map(([lon,lat])=>[lat,lon]);mappedGeometry.set(coords,result);}
  return result;
}
const mappedStops=new WeakMap<OcorrenciaParadaV2[],Parada[]>();
export function stopsForMap(occurrences:OcorrenciaParadaV2[]){
  let result=mappedStops.get(occurrences);
  if(!result){result=[...occurrences].sort((a,b)=>a.ordem-b.ordem).map(s=>({paradaId:s.paradaId,codigo:s.codigoParada,nome:s.nome,ordem:s.ordem,latitude:s.latitude,longitude:s.longitude,posicaoLinha:s.posicaoLinha,distanciaMetros:s.distanciaMetros}));mappedStops.set(occurrences,result);}
  return result;
}
export function projectPhysical(coords: [number, number][] | null | undefined, lat: number, lon: number,window?:{min:number;max:number}) {
  if (!Array.isArray(coords) || coords.length < 2 || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let data=prepared.get(coords);
  if(!data){
  if(coords.some(c=>!c||!Number.isFinite(c[0])||!Number.isFinite(c[1])))return null;
  geometryWork.preparations++;
  const scale = Math.cos(coords[0][0] * Math.PI / 180);
  let total = 0, metres = 0;
  const segments = coords.slice(1).map((b, i) => {
    const a = coords[i], dx = b[1]-a[1], dy = b[0]-a[0];
    const weight = Math.hypot(dx,dy), length = Math.hypot(dx*scale,dy)*111195;
    const walked=total,walkedMetres=metres;
    total += weight; metres += length; return {a,dx,dy,weight,length,walked,walkedMetres};
  });
  const grid=new Map<string,Segment[]>(),long:Segment[]=[];
  for(const s of segments){
    const x0=Math.floor(Math.min(s.a[1],s.a[1]+s.dx)*scale*111195/100),x1=Math.floor(Math.max(s.a[1],s.a[1]+s.dx)*scale*111195/100);
    const y0=Math.floor(Math.min(s.a[0],s.a[0]+s.dy)*111195/100),y1=Math.floor(Math.max(s.a[0],s.a[0]+s.dy)*111195/100);
    if((x1-x0+1)*(y1-y0+1)>64){long.push(s);continue;}
    for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=`${x}|${y}`;const bucket=grid.get(key)??[];bucket.push(s);grid.set(key,bucket);}
  }
  data={scale,total,metres,segments,grid,long,results:new Map()};prepared.set(coords,data);
  }
  const key=`${lat}|${lon}`+(window?`|${window.min}|${window.max}`:'');
  if(data.results.has(key)){geometryWork.cacheHits++;return data.results.get(key)!;}
  geometryWork.projections++;
  const {scale,total,metres,segments}=data;
  const cellX=Math.floor(lon*scale*111195/100),cellY=Math.floor(lat*111195/100);
  const nearby=new Set(data.long);
  for(let x=cellX-1;x<=cellX+1;x++)for(let y=cellY-1;y<=cellY+1;y++)for(const s of data.grid.get(`${x}|${y}`)??[])nearby.add(s);
  let candidates: {gap:number; metres:number}[]=[];
  let best: Projection | null = null;
  const scan=(list:Iterable<Segment>)=>{for (const s of list) {
    if(window&&(s.walkedMetres+s.length<window.min||s.walkedMetres>window.max))continue;
    geometryWork.segments++;
    const {walked,walkedMetres}=s;
    const denominator = (s.dx*scale)**2+s.dy**2;
    const t = denominator ? Math.max(0,Math.min(1,((lon-s.a[1])*s.dx*scale*scale+(lat-s.a[0])*s.dy)/denominator)) : 0;
    const gap = Math.hypot((lon-s.a[1]-s.dx*t)*scale,lat-s.a[0]-s.dy*t)*111195;
    if(window&&(walkedMetres+s.length*t<window.min||walkedMetres+s.length*t>window.max))continue;
    candidates.push({gap,metres:walkedMetres+s.length*t});
    if (!best || gap < best.gap) best = {gap,progress:total ? (walked+s.weight*t)/total : 0,metres:walkedMetres+s.length*t,totalMetres:metres,heading:(Math.atan2(s.dx*scale,s.dy)*180/Math.PI+360)%360};
  }};
  scan(nearby);
  // Within 60 m, every competitive segment (including ambiguity within 15 m)
  // is inside the neighbouring 100 m cells. Far points use the exact full scan.
  if(!best||(best as Projection).gap>60){best=null;candidates=[];scan(segments);}
  const answer=best as Projection|null;
  if(answer)answer.ambiguous=candidates.some(c=>c.gap<=answer.gap+15&&Math.abs(c.metres-answer.metres)>100);
  if(data.results.size>=2048)data.results.delete(data.results.keys().next().value!);
  data.results.set(key,answer);
  return answer;
}
