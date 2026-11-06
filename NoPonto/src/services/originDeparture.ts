import type {TerminalCorridor} from './terminalTracking';
export interface OriginPath {
 coords:[number,number][];metres:number;patterns:string[];
 destinationId?:string;destinationName?:string;
 stops:{id:string;rank:number;metres:number}[];
}
const length=(a:[number,number],b:[number,number])=>Math.hypot(b[0]-a[0],(b[1]-a[1])*Math.cos(a[0]*Math.PI/180))*111195;
const cache=new WeakMap<TerminalCorridor,{family:TerminalCorridor[];path:OriginPath|null}>();
export function originDestination(family:TerminalCorridor[]){
 const first=family[0];
 return first?.destinationId&&family.every(c=>c.destinationId===first.destinationId)?first.destinationName?.split('::')[0].trim().replace(/^Terminal(?: Rodoviário)?(?: de)?\s+/iu,''):undefined;
}
/** A bounded common prefix, sampled by travelled metres, never a chosen branch. */
export function originPath(family:TerminalCorridor[]):OriginPath|null{
 if(!family.length||family.some(c=>c.coords.length<2))return null;
 const prior=cache.get(family[0]);if(prior&&family.length===prior.family.length&&family.every((c,i)=>c===prior.family[i]))return prior.path;
 const samplers=family.map(c=>{
  const cumulative=[0];for(let i=1;i<c.coords.length;i++)cumulative.push(cumulative[i-1]+length(c.coords[i-1],c.coords[i]));
  let index=1;
  return {total:cumulative.at(-1)!,at:(distance:number):[number,number]=>{
   while(index<cumulative.length-1&&cumulative[index]<distance)index++;
   const a=c.coords[index-1],b=c.coords[index],span=cumulative[index]-cumulative[index-1],t=span?(distance-cumulative[index-1])/span:0;
   return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  }};
 });
 const max=Math.min(1500,...family.map(c=>c.maxMetres??1500),...samplers.map(s=>s.total));
 const coords:[number,number][]=[];let metres=0;
 for(let d=0;d<=max;d+=5){const points=samplers.map(s=>s.at(d));if(points.some(p=>length(p,points[0])>3))break;coords.push(points[0]);metres=d;}
 const destination=family[0].destinationId&&family.every(c=>c.destinationId===family[0].destinationId)?family[0]:undefined;
 const stops=family[0].stops.filter(s=>s.metres<=metres&&family.every(c=>c.stops.some(t=>t.id===s.id&&Math.abs(t.metres-s.metres)<=10)));
 const path=metres>=30?{coords,metres,patterns:family.map(c=>c.pattern),destinationId:destination?.destinationId,destinationName:originDestination(family),stops}:null;
 cache.set(family[0],{family:[...family],path});return path;
}
