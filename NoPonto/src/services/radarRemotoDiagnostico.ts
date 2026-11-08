// Instrumentação temporária. Só recebe nomes de etapas constantes, nunca dados do usuário.
export function diagnosticarRadar(etapa: string, evento: string, erro?: unknown) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const mensagem = erro instanceof Error ? erro.message : '';
  // Classificação local: a mensagem original pode conter tokens e nunca é emitida.
  const categoria = /Cannot find native module|not available|is not a function/i.test(mensagem)
    ? 'modulo_nativo_ausente_ou_incompativel'
    : /FirebaseApp|Firebase.*initializ|google-services/i.test(mensagem) ? 'firebase_nativo'
    : /permission|permissao_negada/i.test(mensagem) ? 'permissao'
    : /abort/i.test(mensagem) ? 'timeout'
    : /network|fetch/i.test(mensagem) ? 'rede'
    : erro instanceof SyntaxError ? 'json_invalido'
    : erro ? 'erro_nao_classificado' : undefined;
  console.info('[Radar remoto][DEV-etapas]', etapa, evento, categoria ?? '');
}

export async function etapaRadar<T>(etapa: string, acao: () => Promise<T>): Promise<T> {
  diagnosticarRadar(etapa, 'inicio');
  try {
    const valor = await acao();
    diagnosticarRadar(etapa, 'ok');
    return valor;
  } catch (erro) {
    diagnosticarRadar(etapa, 'falha', erro);
    throw erro;
  }
}
