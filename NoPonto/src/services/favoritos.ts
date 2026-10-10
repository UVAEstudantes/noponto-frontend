import type { ModalApiTransporte } from "../types/transporte";

export const CHAVE_FAVORITOS = "@linhasFavoritas";
export interface LinhaFavorita {
  linhaId: string;
  codigo: string;
  nome: string;
  modal: ModalApiTransporte;
  modalId?: string;
  adicionadaEm: string;
}
export type IdentidadeFavorita = Omit<LinhaFavorita, "adicionadaEm">;
interface StorageFavoritos {
  getItem: (chave: string) => Promise<string | null>;
  setItem: (chave: string, valor: string) => Promise<void>;
}
interface SnapshotFavoritos {
  status: "carregando" | "pronto" | "erro";
  linhas: readonly LinhaFavorita[];
  erro: string | null;
  erroGravacao: string | null;
  salvando: boolean;
}

export function lerFavoritos(raw: string | null): LinhaFavorita[] {
  if (raw === null) return [];
  const dados: unknown = JSON.parse(raw);
  if (!Array.isArray(dados)) throw new Error("Formato inválido de favoritos.");
  const porId = new Map<string, LinhaFavorita>();
  for (const item of dados) {
    if (!item || typeof item.linhaId !== "string" || !item.linhaId.trim()
      || typeof item.codigo !== "string" || typeof item.nome !== "string"
      || !["onibus", "brt", "trem", "metro"].includes(item.modal)
      || typeof item.adicionadaEm !== "string" || !Number.isFinite(Date.parse(item.adicionadaEm))
      || (item.modalId !== undefined && typeof item.modalId !== "string")) {
      throw new Error("Dados inválidos de favoritos.");
    }
    if (!porId.has(item.linhaId)) porId.set(item.linhaId, item);
  }
  return [...porId.values()];
}

// Uma coleção compartilhada; o storage é injetado para testar falhas sem acessar o aparelho.
export function criarColecaoFavoritos(storage: StorageFavoritos) {
  let snapshot: SnapshotFavoritos = {
    status: "carregando", linhas: [], erro: null, erroGravacao: null, salvando: false,
  };
  const listeners = new Set<() => void>();
  let leitura: Promise<void> | null = null;
  let gravacao: Promise<void> | null = null;
  let revisao = 0, revisaoSalva = 0;
  const publicar = (mudancas: Partial<SnapshotFavoritos>) => {
    snapshot = { ...snapshot, ...mudancas };
    listeners.forEach((listener) => listener());
  };
  const hidratar = (): Promise<void> => {
    if (snapshot.status === "pronto") return Promise.resolve();
    if (leitura) return leitura;
    publicar({ status: "carregando", erro: null });
    leitura = (async () => {
      try {
        const linhas = lerFavoritos(await storage.getItem(CHAVE_FAVORITOS));
        publicar({ status: "pronto", linhas, erro: null });
      } catch {
        // Não grava [], não remove a chave e não encobre JSON inválido.
        publicar({ status: "erro", erro: "Não foi possível carregar os favoritos. Os dados locais foram preservados." });
      }
    })().finally(() => { leitura = null; });
    return leitura;
  };
  const persistir = (): Promise<void> => {
    if (snapshot.status !== "pronto") return Promise.resolve();
    if (gravacao) return gravacao;
    publicar({ salvando: true, erroGravacao: null });
    gravacao = (async () => {
      while (revisaoSalva < revisao) {
        const atual = revisao;
        const raw = JSON.stringify(snapshot.linhas);
        try {
          await storage.setItem(CHAVE_FAVORITOS, raw);
          revisaoSalva = atual;
        } catch {
          publicar({ erroGravacao: "Alterações dos favoritos ainda não foram salvas. Tente novamente." });
          break;
        }
      }
    })().finally(() => {
      gravacao = null;
      publicar({ salvando: false });
      // Uma alteração pode chegar entre a conclusão do loop e este finally.
      if (revisaoSalva < revisao && !snapshot.erroGravacao) void persistir();
    });
    return gravacao;
  };
  const remover = (linhaId: string) => {
    if (snapshot.status !== "pronto" || !snapshot.linhas.some((linha) => linha.linhaId === linhaId)) return;
    revisao++;
    publicar({ linhas: snapshot.linhas.filter((linha) => linha.linhaId !== linhaId) });
    void persistir();
  };
  const alternar = (identidade: IdentidadeFavorita) => {
    if (snapshot.status !== "pronto") return;
    if (snapshot.linhas.some((linha) => linha.linhaId === identidade.linhaId)) {
      remover(identidade.linhaId);
      return;
    }
    const linha = { ...identidade, adicionadaEm: new Date().toISOString() };
    lerFavoritos(JSON.stringify([linha])); // Valida antes de publicar ou gravar.
    revisao++;
    publicar({ linhas: [...snapshot.linhas, linha] });
    void persistir();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hidratar, alternar, remover,
    tentarNovamente: () => snapshot.status === "erro" ? hidratar() : persistir(),
  };
}
