import React from 'react';
import {View,Text} from 'react-native';
import {Signal,SignalHigh,SignalMedium,SignalLow,SignalZero,WifiOff} from 'lucide-react-native';
import {gpsFreshness,GPS_FRESHNESS_HELP} from '@/src/services/gpsPresentationPolicy';
const icons={'signal':Signal,'signal-high':SignalHigh,'signal-medium':SignalMedium,'signal-low':SignalLow,'signal-zero':SignalZero,'wifi-off':WifiOff};
export function GpsFreshnessIndicator({at,now,uncertain=false,textColor}:{at:number;now:number;uncertain?:boolean;textColor:string}){
 const q=gpsFreshness(at,now,uncertain),Icon=icons[q.icon];
 return <View accessible accessibilityLabel={`Frescor temporal do GPS: ${q.label}. ${uncertain?'Localização incerta. ':''}${GPS_FRESHNESS_HELP}`} style={{flexDirection:'row',alignItems:'center',gap:4,flexShrink:1}}>
  <Icon size={16} color={q.color}/><Text style={{fontSize:10,color:textColor,flexShrink:1}}>{'GPS: '+q.label}</Text>
 </View>;
}
