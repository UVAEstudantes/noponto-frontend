// Catálogos mutáveis expiram; falhas e respostas vazias permitem nova tentativa.
export function criarCatalogoCompartilhado<T>(carregar: () => Promise<T[]>, validadeMs = 300000) {
  let pending: Promise<T[]> | undefined;
  let dados: T[] | undefined;
  let expira = 0;
  return (): Promise<T[]> => {
    if (dados && Date.now() < expira) return Promise.resolve(dados);
    if (!pending) {
      pending = Promise.resolve().then(carregar).then(resultado => {
        if (resultado.length) { dados = resultado; expira = Date.now() + validadeMs; }
        return resultado;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  };
}
