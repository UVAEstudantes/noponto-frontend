// Test-only diagnostic support. Normal application modules do not import this file.
type Position={ordem?:string;id?:string;timestamp?:number|string;[key:string]:unknown};
const enabled=typeof __DEV__!=='undefined'&&__DEV__&&process.env.EXPO_PUBLIC_R28_MOVEMENT_TRACE==='true';
export const movementTraceOrders=enabled?[...new Set((process.env.EXPO_PUBLIC_R28_MOVEMENT_ORDERS??'').split(',').map((s:string)=>s.trim().toUpperCase()).filter(Boolean))].slice(0,8):[];
const previous=new Map<string,string>();
/** Opt-in scalar evidence. No geometry, timestamps renewed, or logs on clock ticks. */
export function recordMovementTrace(stage:string,p:Position,facts:Record<string,unknown>={}){
 const order=(p.ordem??p.id??'').toUpperCase();if(!movementTraceOrders.includes(order))return;
 const entry={stage,order,physicalAt:p.timestamp,source:p.unifiedSource,pattern:p.padraoVersaoId,direction:p.sentidoNome,
  physicalRoutePattern:p.physicalRoutePattern,routeConfidence:p.routeConfidence,directionConfidence:p.directionConfidence,
  eligible:p.backendMotionEligible,reason:p.motionReason,speed:p.lastObservedSpeedKmh,speedAt:p.speedObservedAt,
  projectionSpeed:p.projectionSpeedKmh,speedKind:p.projectionSpeedKind,progress:p.posicaoNaRota,remaining:p.motionRemainingMetres,
  projectionUntil:p.projectionUntil,nextStopReason:p.nextStopReason,...facts};
 const key=order+'|'+stage,signature=JSON.stringify(entry);if(previous.get(key)===signature)return;
 if(previous.size>=64&&!previous.has(key))previous.delete(previous.keys().next().value!);previous.set(key,signature);
 const target=globalThis as typeof globalThis&{__nopontoMovementTrace?:unknown[]};
 const history=target.__nopontoMovementTrace??=[];history.push(entry);if(history.length>120)history.shift();
 console.debug('[R28Motion]',entry);
}
