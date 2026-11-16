import React from 'react';
import {View,Text} from 'react-native';
import {Signal,SignalHigh,SignalMedium,SignalLow,SignalZero,WifiOff} from 'lucide-react-native';
import {gpsFreshness,GPS_FRESHNESS_HELP} from '@/src/services/gpsPresentationPolicy';
const icons={'signal':Signal,'signal-high':SignalHigh,'signal-medium':SignalMedium,'signal-low':SignalLow,'signal-zero':SignalZero,'wifi-off':WifiOff};
export function GpsFreshnessIndicator({at,now,uncertain=false,textColor}:{at:number;now:number;uncertain?:boolean;textColor:string}){
 const q=gpsFreshness(at,now,uncertain),Icon=icons[q.icon];
 return <View accessible accessibilityLabel={`Frescor temporal do GPS: ${q.label}. ${uncertain?'Localização incerta. ':''}${GPS_FRESHNESS_HELP}`} style={{flexDirection:'row',alignItems:'center',gap:4,flexShrink:1}}>
  <View style={{width:20,height:20}}><Signal size={20} color="#a3a3a3" style={{position:'absolute',opacity:.5}}/><Icon size={20} color={q.color} style={{position:'absolute'}}/></View><Text style={{fontSize:10,color:textColor,flexShrink:1}}>{'GPS: '+q.label}</Text>
 </View>;
}
