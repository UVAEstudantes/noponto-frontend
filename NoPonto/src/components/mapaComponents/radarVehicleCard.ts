import type {ViewStyle,TextStyle} from 'react-native';
import {hexParaRgba} from '@/src/utils/cores';
type Colors={textoPrimario:string;textoSecundario:string;bordaSuave:string;fundoCard?:string;fundoPainel?:string};
function mixed(a:string,b:string,alpha:number){const rgb=(s:string)=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));const x=rgb(a),y=rgb(b);return '#'+x.map((v,i)=>Math.round(v*alpha+y[i]*(1-alpha)).toString(16).padStart(2,'0')).join('');}
/** Extracted from the operational radar card: physical cards share its tokens. */
export function radarCardFrame(cores:Colors,accent:string,dark:boolean,first:boolean,sheet=false):ViewStyle{
 return sheet?{flexDirection:'column',paddingVertical:10,paddingHorizontal:12,borderRadius:12,backgroundColor:mixed(cores.textoPrimario,cores.fundoPainel??cores.fundoCard??'#ffffff',dark?.035:.025),borderWidth:1,borderColor:cores.bordaSuave,marginBottom:8}
 :{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:9,paddingVertical:6,borderRadius:17,minHeight:52,marginTop:first?0:5,borderWidth:1,borderColor:first?`${accent}40`:cores.bordaSuave,backgroundColor:first?hexParaRgba(dark?(cores.fundoCard??'#111'):'#FFFAEB',.96):hexParaRgba(cores.fundoCard??'#fff',.96)};
}
export function radarCardBadge(accent:string,sheet=false,background='#ffffff'):ViewStyle{return sheet?{width:38,height:38,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:mixed(accent,background,.16),marginRight:10}:{minWidth:40,maxWidth:90,minHeight:40,borderRadius:12,paddingHorizontal:6,alignItems:'center',justifyContent:'center',backgroundColor:accent};}
export function radarCardTitle(color:string):TextStyle{return {color,fontSize:13,fontWeight:'700'};}
export function radarCardSecondary(color:string):TextStyle{return {color,fontSize:10,marginTop:3};}
