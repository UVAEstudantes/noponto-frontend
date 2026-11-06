export interface GpsPresentationPolicy {
  delayedMs:number; attenuatedMs:number; publicMs:number;
  currentSpeedMs:number; contextMs:number; baseProjectionMs:number;
  coherentProjectionMs:number; maxProjectionMetres:number;
  terminalRadiusMetres:number; terminalExitMetres:number; dwellMs:number;
  initialStops:number; initialMetres:number;
}
// Override through createHybridComposer({policy}) for a controlled candidate.
// Physical, contextual and projection lifetimes deliberately remain independent.
const DEFAULT_POLICY:Readonly<GpsPresentationPolicy>=Object.freeze({
  delayedMs:180000,attenuatedMs:300000,publicMs:480000,
  currentSpeedMs:60000,contextMs:180000,baseProjectionMs:60000,
  coherentProjectionMs:90000,maxProjectionMetres:250,
  terminalRadiusMetres:35,terminalExitMetres:70,dwellMs:15000,
  initialStops:3,initialMetres:1500,
});
export function configureGpsPolicy(overrides:Partial<GpsPresentationPolicy>):Readonly<GpsPresentationPolicy>{
  const p={...DEFAULT_POLICY,...overrides};
  if(Object.values(p).some(v=>!Number.isFinite(v)||v<=0)
    ||p.delayedMs>=p.attenuatedMs||p.attenuatedMs>=p.publicMs||p.currentSpeedMs>p.delayedMs
    ||p.baseProjectionMs>p.coherentProjectionMs||p.coherentProjectionMs>120000||p.maxProjectionMetres>400
    ||p.terminalRadiusMetres>60||p.terminalExitMetres<=p.terminalRadiusMetres
    ||!Number.isInteger(p.initialStops)||p.initialStops>6||p.initialMetres>1500||p.dwellMs<10000)
    throw new Error('Invalid GPS presentation policy');
  return Object.freeze(p);
}
const numeric=(raw:string|undefined,fallback:number)=>raw?.trim()?Number(raw):fallback;
function configuredPolicy(){
  try{return configureGpsPolicy({
    delayedMs:numeric(process.env.EXPO_PUBLIC_GPS_DELAYED_SECONDS,180)*1000,
    attenuatedMs:numeric(process.env.EXPO_PUBLIC_GPS_ATTENUATED_SECONDS,300)*1000,
    publicMs:numeric(process.env.EXPO_PUBLIC_GPS_PUBLIC_SECONDS,480)*1000,
    terminalRadiusMetres:numeric(process.env.EXPO_PUBLIC_TERMINAL_RADIUS_METRES,35),
    initialStops:numeric(process.env.EXPO_PUBLIC_TERMINAL_INITIAL_STOPS,3),
    initialMetres:numeric(process.env.EXPO_PUBLIC_TERMINAL_INITIAL_METRES,1500),
  });}catch{return DEFAULT_POLICY;}
}
export const GPS_POLICY=configuredPolicy();
// Sequence AND distance: Campo Grande's second stop is 1245 m from the origin.
export const TERMINAL_CORRIDOR_OVERRIDES:Readonly<Record<string,Record<string,{initialMetres?:number;initialStops?:number}>>>=Object.freeze({
  '838':{'5144O00486P9':{initialMetres:1500}},
});
export function gpsPresentation(physicalAt:number,now:number,policy:Readonly<GpsPresentationPolicy>=GPS_POLICY){
  const age=now-physicalAt;
  return {visible:Number.isFinite(age)&&age>=0&&age<=policy.publicMs,
    delayed:age>=policy.delayedMs,opacity:age>=policy.attenuatedMs ? .55 : 1,
    warning:age>=policy.attenuatedMs?'Última posição conhecida':age>=policy.delayedMs?'GPS atrasado':null};
}
