import { Platform } from 'react-native';
import { criarCanalNotificacaoLocal } from './notificacaoLocalCanal';
export const IDENTIFICADOR_RADAR_ESPERA = 'noponto:radar:acompanhamento-local';
export const clienteRadarEspera = criarCanalNotificacaoLocal(IDENTIFICADOR_RADAR_ESPERA,
  'radar-chegada-local', 'revisaoRadar', () => Platform.OS === 'android');
