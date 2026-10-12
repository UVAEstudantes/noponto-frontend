import { categoriaModalV2, type CategoriaTransporteV2 } from "../types/estruturaV2";
import type { ModalTransporteDto } from "../types/transporte";

// Compartilha carregamentos concorrentes e guarda somente catálogos válidos.
export function criarFiltroModalBusca(carregar: () => Promise<ModalTransporteDto[]>) {
  let catalogo: Promise<ModalTransporteDto[]> | undefined;
  return async (categoria: CategoriaTransporteV2): Promise<{ modalId: string }> => {
    catalogo ??= carregar().then((modais) => {
      if (!modais.length) throw new Error("Não foi possível carregar o catálogo de modais.");
      return modais;
    }).catch((error) => {
      catalogo = undefined;
      throw error;
    });
    const modais = await catalogo;
    const modal = modais.find((item) => categoriaModalV2(item.nome) === categoria);
    if (!modal?.id) {
      catalogo = undefined;
      throw new Error(`Modal ${categoria} indisponível no catálogo. Tente novamente.`);
    }
    return { modalId: modal.id };
  };
}
