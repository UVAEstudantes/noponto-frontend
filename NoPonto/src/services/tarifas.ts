import { api } from "./api";

export interface FormaPagamento {
  id: string;
  nome: string;
  icone?: string | null;
  cor?: string | null;
}

export interface TarifaResolvida {
  linhaId: string | null;
  modalId: string;
  tarifa: {
    valor: number | null;
    origem: string | null;
    fonte: string | null;
    moeda: string;
  };
  formasPagamento: FormaPagamento[];
}

export async function resolverTarifa(linhaId: string, signal: AbortSignal): Promise<TarifaResolvida> {
  const response = await api.get<TarifaResolvida>("/tarifas/resolver", {
    params: { linhaId }, signal,
  });
  if (!response.ok || !response.data?.tarifa) throw new Error("Tarifa indisponível");
  const valor = response.data.tarifa.valor;
  if (valor !== null && (typeof valor !== "number" || !Number.isFinite(valor))) throw new Error("Tarifa inválida");
  if (!Array.isArray(response.data.formasPagamento)) throw new Error("Métodos de pagamento inválidos");
  return response.data;
}
