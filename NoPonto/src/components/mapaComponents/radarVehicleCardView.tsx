import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {radarCardBadge, radarCardFrame, radarCardSecondary, radarCardTitle} from './radarVehicleCard';

type Props = {
  cardKey: string;
  cores: Parameters<typeof radarCardFrame>[0];
  accent: string;
  badgeColor: string;
  badge: React.ReactNode;
  dark: boolean;
  first?: boolean;
  sheet?: boolean;
  opacity?: number;
  title: string;
  titleColor?: string;
  subtitle?: string;
  subtitleLines?: number;
  metadata?: React.ReactNode;
  trailing: React.ReactNode;
  children?: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  expanded?: boolean;
  accessibilityLabel?: string;
};

/** The arrival card's actual layout, shared by physical presence and arrivals. No hooks or GPS work. */
export function renderRadarVehicleCard(p: Props) {
  const columns = <>
    <View style={radarCardBadge(p.badgeColor, p.sheet, p.cores.fundoCard)}>{p.badge}</View>
    <View style={{flex: 1, minWidth: 0}}>
      <Text numberOfLines={1} style={radarCardTitle(p.titleColor ?? p.cores.textoPrimario)}>{p.title}</Text>
      {!!p.subtitle && <Text numberOfLines={p.subtitleLines ?? 1} style={radarCardSecondary(p.cores.textoSecundario)}>{p.subtitle}</Text>}
      {p.metadata}
    </View>
    {p.trailing}
  </>;
  return <Pressable key={p.cardKey} onPress={p.onPress} disabled={p.disabled}
    accessibilityRole="button" accessibilityLabel={p.accessibilityLabel} accessibilityState={p.expanded==null?undefined:{expanded:p.expanded}}
    style={{...radarCardFrame(p.cores, p.accent, p.dark, !!p.first, p.sheet), ...(p.opacity == null ? {} : {opacity: p.opacity})}}>
    {p.sheet ? <View style={{flexDirection: 'row', alignItems: 'center', width: '100%'}}>{columns}</View> : columns}
    {p.children}
  </Pressable>;
}
