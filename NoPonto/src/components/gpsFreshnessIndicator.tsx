import React from 'react';
import {View,Text} from 'react-native';
import Svg, {Rect} from 'react-native-svg';
import {gpsFreshness,GPS_FRESHNESS_HELP} from '@/src/services/gpsPresentationPolicy';
export function GpsFreshnessIndicator({at,now,uncertain=false,textColor}:{at:number;now:number;uncertain?:boolean;textColor:string}){
 const q=gpsFreshness(at,now,uncertain);
 return <View accessible accessibilityLabel={`Frescor temporal do GPS: ${q.label}. ${uncertain?'Localização incerta. ':''}${GPS_FRESHNESS_HELP}`} style={{flexDirection:'row',alignItems:'center',gap:4,flexShrink:1}}>
  <Svg width={20} height={20} viewBox="0 0 24 24" aria-hidden>{[0,1,2,3,4].map(i=><Rect key={i} x={2+i*4} y={18-i*3} width={2} height={4+i*3} rx={1} fill={i<q.bars?q.color:'#a3a3a3'}/>)}</Svg><Text style={{fontSize:10,color:textColor,flexShrink:1}}>{'GPS: '+q.label}</Text>
 </View>;
}
