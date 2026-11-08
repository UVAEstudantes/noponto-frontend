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
function canaisCor(cor:string):[number,number,number]|null{
 const hex=cor.replace('#','').trim();const cheio=hex.length===3?hex.split('').map(c=>c+c).join(''):hex;
 if(!/^[0-9a-f]{6}$/i.test(cheio))return null;
 return [0,2,4].map(i=>parseInt(cheio.slice(i,i+2),16)) as [number,number,number];
}
function luminancia([r,g,b]:[number,number,number]){
 const linear=(v:number)=>{const x=v/255;return x<=0.03928?x/12.92:((x+0.055)/1.055)**2.4;};
 return 0.2126*linear(r)+0.7152*linear(g)+0.0722*linear(b);
}
/** Cores claras mantêm o tom oficial; as demais escurecem só o necessário para texto branco. */
export function fundoIdentificador(cor:string):string{
 const rgb=canaisCor(cor);if(!rgb)return cor;
 if(luminancia(rgb)>=0.5)return cor;
 let [r,g,b]=rgb;
 for(let i=0;i<80&&1.05/(luminancia([r,g,b])+0.05)<4.5;i++)[r,g,b]=[r,g,b].map(v=>Math.round(v*0.94));
 return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}
/** Texto legível sobre o identificador: branco em cores médias/escuras, escuro nas muito claras. */
export function textoSobreCor(cor:string):string{
 const rgb=canaisCor(cor);if(!rgb)return '#FFFFFF';
 return luminancia(rgb)>=0.5?'#1E1E1E':'#FFFFFF';
}
