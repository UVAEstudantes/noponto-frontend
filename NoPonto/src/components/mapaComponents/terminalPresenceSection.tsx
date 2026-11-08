import React from 'react';
import {Pressable,Text,View} from 'react-native';
import {BusFront,MapPin,ChevronRight,ChevronDown} from 'lucide-react-native';
import {terminalVehicleFocus,type TerminalRadarVehicle} from '@/src/services/terminalTracking';
import {physicalPassengerLabel} from '@/src/services/radarPassenger';
import {renderRadarVehicleCard} from './radarVehicleCardView';
import {fundoIdentificador,textoSobreCor} from './radarVehicleCard';

export function renderTerminalPresenceSection(vehicles:TerminalRadarVehicle[],now:number,
 cores:{textoPrimario:string;textoSecundario:string;bordaSuave:string;fundoCard?:string;iconePrimario?:string},onFocus?:(vehicle:TerminalRadarVehicle)=>void,
 options:{sheet?:boolean;first?:boolean;dark?:boolean;accent?:string;lineColors?:Record<string,string>;expandedKey?:string|null;infoKey?:string|null;onToggleInfo?:(key:string)=>void;forecasts?:string[];onToggle?:(key:string)=>void}={}){
 if(!vehicles.length)return null;
 return <View key={vehicles[0]?.key}>{vehicles.filter(v=>now>=v.physicalAt&&now-v.physicalAt<=300000&&now<=v.validUntil).map((v,index)=>{
  const age=Math.max(0,Math.floor((now-v.physicalAt)/1000)),delayed=age>=180;
  const localizable=!!onFocus&&!!terminalVehicleFocus(v,now),expanded=options.expandedKey===v.key;
  const accent=options.lineColors?.[v.lineId]??options.accent??cores.iconePrimario??'#2979ff';
  const state=physicalPassengerLabel(v),uncertain=v.state==='Na região da origem';
  const estimate=(v.state==='A caminho'||v.state==='Saindo do terminal')?v.estimatedMinutes:undefined;
  const detailLabel='GPS há '+(age<60?age+' s':Math.floor(age/60)+' min '+age%60+' s');
  return renderRadarVehicleCard({cardKey:v.key,cores,accent:options.accent??accent,badgeColor:fundoIdentificador(accent),
   dark:!!options.dark,first:options.first??index===0,sheet:!!options.sheet,opacity:delayed?.65:1,
   badge:options.sheet?<BusFront size={19} color={accent}/>:<Text numberOfLines={1} style={{color:textoSobreCor(accent),fontSize:16,fontWeight:'800'}}>{v.code}</Text>,
   title:options.sheet?v.code:state,subtitle:options.sheet?state:v.directionName?`Sentido ${v.directionName.split('::')[0].trim()}`:undefined,subtitleLines:1,
   metadata:options.sheet&&v.directionName?<Text numberOfLines={1} style={{fontSize:10,color:cores.textoSecundario,marginTop:3}}>Sentido {v.directionName.split('::')[0].trim()}</Text>:undefined,expanded:options.sheet?expanded:undefined,
   trailing:<View style={{alignItems:'flex-end',maxWidth:110}}>
    {estimate&&<Text style={{fontSize:12,fontWeight:'700',color:cores.textoPrimario}}>Chega em {estimate[0]}–{estimate[1]} min</Text>}
    {estimate&&<Text style={{fontSize:10,color:cores.textoSecundario}}>Estimativa GPS</Text>}
    {delayed&&<Text style={{fontSize:10,color:cores.textoSecundario}}>GPS atrasado</Text>}
    {uncertain&&<Text accessibilityLabel="Localização estimada" style={{color:cores.textoSecundario}}>≈</Text>}
   </View>,accessibilityLabel:options.sheet?'Detalhes da linha '+v.code:'Localizar linha '+v.code+' no mapa',
   disabled:options.sheet?false:!localizable,onPress:()=>{if(options.sheet)options.onToggle?.(v.key);else if(localizable)onFocus?.(v);},
   children:options.sheet&&expanded?<View style={{width:'100%',marginTop:10,paddingTop:10,borderTopWidth:1,borderColor:cores.bordaSuave}}>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
     <View style={{flex:1,minWidth:100}}><Text style={{fontSize:11,color:cores.textoSecundario}}>Veículo</Text><Text style={{fontSize:13,fontWeight:'600',color:cores.textoPrimario,marginTop:3}}>{v.order}</Text></View>
     <View style={{flex:1,minWidth:110}}><Text style={{fontSize:11,color:cores.textoSecundario}}>Atualização GPS</Text><Text style={{fontSize:13,fontWeight:'600',color:cores.textoPrimario,marginTop:3}}>{detailLabel.replace('GPS ','')}</Text></View>
    </View>
    {!v.operationalConfirmed&&v.directionName&&<Text style={{color:cores.textoSecundario,fontSize:11,marginTop:6}}>Sentido estimado</Text>}
    {options.forecasts?.map((label,i)=><Text key={i} style={{color:cores.textoSecundario,fontSize:11,marginTop:6}}>Passagem prevista · {label}</Text>)}
    {v.dwellSince!=null&&<>
     <Pressable accessibilityRole="button" accessibilityLabel="Como contamos o tempo no terminal" accessibilityState={{expanded:options.infoKey===v.key}}
      onPress={event=>{event?.stopPropagation?.();options.onToggleInfo?.(v.key);}} style={{minHeight:44,flexDirection:'row',alignItems:'center',gap:5}}>
      <Text style={{fontSize:11,color:cores.textoSecundario}}>Sobre o tempo de espera</Text>{options.infoKey===v.key?<ChevronDown size={13} color={cores.textoSecundario}/>:<ChevronRight size={13} color={cores.textoSecundario}/>}
     </Pressable>
     {options.infoKey===v.key&&<Text style={{fontSize:11,lineHeight:16,color:cores.textoSecundario,marginBottom:8}}>Contado desde as primeiras posições paradas que observamos. A chegada pode ter ocorrido antes.</Text>}
    </>}
    {localizable&&<Pressable accessibilityRole="button" accessibilityLabel={'Localizar '+v.order+' no mapa'} onPress={event=>{event?.stopPropagation?.();onFocus?.(v);}}
      style={{minHeight:44,borderRadius:10,borderWidth:1,borderColor:cores.bordaSuave,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,marginTop:8,backgroundColor:cores.fundoCard}}>
      <MapPin size={15} color={accent}/><Text style={{color:accent,fontSize:12,fontWeight:'700'}}>Localizar no mapa</Text>
     </Pressable>}
   </View>:null});
 })}</View>;
}
