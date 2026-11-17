import { ErroRadarRemoto } from './radarRemotoCore';
import { requireNativeModule } from 'expo-modules-core';
export async function selecionarDataHoraProgramacao(mode: 'date' | 'time', value: string): Promise<string | null> {
  const native = requireNativeModule<{
    selectScheduleTime(h: number, m: number): Promise<string | null>;
    selectScheduleDate(y: number, m: number, d: number): Promise<string | null>;
  }>('RadarNativeNotification');
  if (typeof native.selectScheduleTime !== 'function' || typeof native.selectScheduleDate !== 'function') throw new ErroRadarRemoto(0, 'seletor_nativo_indisponivel');
  if (mode === 'time') { const [h,m] = value.split(':').map(Number); return native.selectScheduleTime(h,m); }
  const [y,m,d] = value.split('-').map(Number);
  return native.selectScheduleDate(y,m,d);
}
