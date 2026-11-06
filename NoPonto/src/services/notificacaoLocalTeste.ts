import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { criarCanalNotificacaoLocal } from './notificacaoLocalCanal';

export const CANAL_RADAR_TESTE = 'radar-chegada-simulacao';
export const IDENTIFICADOR_RADAR_TESTE = 'noponto:radar:simulacao-local';
export const CENARIOS_NOTIFICACAO_TESTE = {
  exibir: '838 chegando em 5 min',
  atualizar: '855 chegando em 3 min',
  atualizarNovamente: '838 chegando em 2 min',
} as const;
export type CenarioNotificacaoTeste = keyof typeof CENARIOS_NOTIFICACAO_TESTE;
export type ResultadoNotificacaoTeste = 'exibida' | 'encerrada' | 'negada' | 'indisponivel' | 'erro';
const cliente = criarCanalNotificacaoLocal(IDENTIFICADOR_RADAR_TESTE, CANAL_RADAR_TESTE, 'revisaoTeste',
  () => __DEV__ && Platform.OS === 'android');

export async function verificarPermissaoNotificacao() { return Notifications.getPermissionsAsync(); }

/** Mesmo contrato e identidade da N2-B; infraestrutura compartilhada com o Radar real. */
export async function testarNotificacaoLocal(cenario: CenarioNotificacaoTeste = 'exibir'): Promise<ResultadoNotificacaoTeste> {
  const resultado = await cliente.publicar({ title: 'NoPonto · Radar', body: CENARIOS_NOTIFICACAO_TESTE[cenario],
    data: { simulacao: true, origem: 'teste-local-n2a', dadosReais: false } }, true);
  return resultado === 'cancelada' ? 'erro' : resultado;
}
export async function encerrarNotificacaoLocal(): Promise<ResultadoNotificacaoTeste> {
  const resultado = await cliente.remover();
  return resultado === 'cancelada' ? 'erro' : resultado;
}
