import {
  CoordenadaMapa,
  ItinerarioLinha,
  ItinerarioPorLinhaMapaDto,
  LinhaSimplesDto,
  LinhasResponse,
  LinhaTempoReal,
  ModalApiTransporte,
  OpcaoBusca,
  Parada,
  PoiDto,
  PosicaoVeiculo,
  SentidoSimples,
  SentidosResponse,
  VeiculosLinhaDto,
  VeiculoTempoReal,
} from "@/src/types/transporte";
import { api } from "./api";

const TARIFA_PADRAO = 4.7;
const INTERVALO_PADRAO = "~20 min";

const FORMATADOR_NUMERICO = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

// ─── /linhas ───────────────────────────────────────────────────────────────

export async function buscarLinhasDto(
  nome?: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<LinhaSimplesDto[]> {
  const response = await api.get<LinhasResponse>("/linhas", {
    params: { nome: nome || "", page, pageSize },
  });
  if (!response.ok || !response.data) return [];
  return response.data.itens;
}

// ─── /sentidos ─────────────────────────────────────────────────────────────

export async function buscarSentidosPorLinha(
  linhaId: string,
): Promise<SentidoSimples[]> {
  const response = await api.get<SentidosResponse>("/sentidos", {
    params: { linhaId, page: 1, pageSize: 10 },
  });
  if (!response.ok || !response.data) return [];
  return response.data.itens;
}

// ─── /itinerarios ──────────────────────────────────────────────────────────

export async function buscarMapaPorLinha(
  linhaId: string,
): Promise<ItinerarioPorLinhaMapaDto | null> {
  const response = await api.get<ItinerarioPorLinhaMapaDto>(
    `/itinerarios/por-linha/${linhaId}/mapa`,
    { params: { incluirParadas: true } },
  );
  if (!response.ok || !response.data) return null;
  return response.data;
}

// ─── Busca de opções para o input ──────────────────────────────────────────

export async function buscarOpcoesPorNome(
  nome: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<OpcaoBusca[]> {
  if (!nome.trim()) return [];
  const linhas = await buscarLinhasDto(nome, page, pageSize);
  return linhas.map((linha) => ({
    linha,
    nomeExibicao: linha.codigo
      ? `${linha.codigo} - ${linha.nome.replace(linha.codigo, "").replace(/^[-\s]+/, "").trim()}`
      : linha.nome,
  }));
}

// ─── Itinerário mesclado (ida + volta) ─────────────────────────────────────

export async function buscarItinerarioLinhaMesclado(
  linhaId: string,
  linhaCodigo: string,
  modal: ModalApiTransporte,
): Promise<ItinerarioLinha | null> {
  const mapaLinha = await buscarMapaPorLinha(linhaId);
  if (!mapaLinha || !mapaLinha.itinerarios?.length) return null;

  const segmentos: CoordenadaMapa[][] = [];
  const todasParadas: Parada[] = [];
  let itinerarioIdIda: string | undefined;
  let itinerarioIdVolta: string | undefined;

  mapaLinha.itinerarios.forEach((it) => {
    const coordenadas: CoordenadaMapa[] = (it.geometria ?? [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((g) => [g.latitude, g.longitude]);
    if (coordenadas.length === 0) return;

    const isIda =
      it.sentidoNome?.toUpperCase().includes("IDA") || segmentos.length === 0;

    if (isIda) {
      segmentos[0] = coordenadas;
      itinerarioIdIda = it.itinerarioId;
    } else {
      segmentos[1] = coordenadas;
      itinerarioIdVolta = it.itinerarioId;
    }

    it.paradas?.forEach((parada) => {
      if (!todasParadas.some((p) => p.paradaId === parada.paradaId)) {
        todasParadas.push(parada);
      }
    });
  });

  const filtrados = segmentos.filter(Boolean);
  if (filtrados.length === 0) return null;

  return {
    linha: linhaCodigo,
    modal,
    segmentos: filtrados,
    paradas: todasParadas,
    itinerarioIdIda,
    itinerarioIdVolta,
  };
}

// ─── POIs ───────────────────────────────────────────────────────────────────

export async function buscarPoisPorItinerario(
  itinerarioId: string,
  sort: string = "prioridade",
): Promise<PoiDto[]> {
  const response = await api.get<PoiDto[]>(
    `/pois/por-itinerario/${itinerarioId}`,
    { params: { sort } },
  );
  if (!response.ok || !response.data) return [];
  return response.data;
}

// ─── Veículos ───────────────────────────────────────────────────────────────

export async function buscarVeiculosPorLinha(
  codigoLinha: string,
): Promise<VeiculoTempoReal[]> {
  const response = await api.get<VeiculosLinhaDto>(
    `/veiculos/linha/${codigoLinha}`,
  );
  if (!response.ok || !response.data) return [];
  return response.data.posicoes.map(converterPosicao);
}

function converterPosicao(v: PosicaoVeiculo): VeiculoTempoReal {
  return {
    id: v.ordem,
    modal: "onibus",
    linha: v.codigoLinha.trim().toUpperCase(),
    latitude: v.latitude,
    longitude: v.longitude,
    timestamp: new Date(v.timestampGps).getTime(),
    velocidade: v.velocidade,
    direcao: calcularDirecao(v),
  };
}

function calcularDirecao(v: PosicaoVeiculo): number | null {
  if (v.latitudeAnterior == null || v.longitudeAnterior == null) return null;
  if (
    Math.abs(v.latitude - v.latitudeAnterior) < 1e-5 &&
    Math.abs(v.longitude - v.longitudeAnterior) < 1e-5
  )
    return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLon = toRad(v.longitude - v.longitudeAnterior);
  const y = Math.sin(dLon) * Math.cos(toRad(v.latitude));
  const x =
    Math.cos(toRad(v.latitudeAnterior)) * Math.sin(toRad(v.latitude)) -
    Math.sin(toRad(v.latitudeAnterior)) *
      Math.cos(toRad(v.latitude)) *
      Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function chaveLinhaModal(
  linha: string,
  modal: ModalApiTransporte,
): string {
  return `${modal}:${linha.trim().toUpperCase()}`;
}

export function construirLinhasDisponiveis(
  veiculos: VeiculoTempoReal[],
): LinhaTempoReal[] {
  const grupos = new Map<string, VeiculoTempoReal[]>();
  veiculos.forEach((v) => {
    const chave = chaveLinhaModal(v.linha, v.modal);
    const lista = grupos.get(chave) ?? [];
    lista.push(v);
    grupos.set(chave, lista);
  });

  const linhas: LinhaTempoReal[] = Array.from(grupos.entries()).map(([chave]) => {
    const [modal, nome] = chave.split(":") as [ModalApiTransporte, string];
    return { id: chave, nome, modal, sentido: "Ida ↔ Volta", intervalo: INTERVALO_PADRAO, tarifa: TARIFA_PADRAO };
  });

  return linhas.sort((a, b) => {
    if (a.modal !== b.modal) return a.modal.localeCompare(b.modal);
    return FORMATADOR_NUMERICO.compare(a.nome, b.nome);
  });
}

export async function buscarVeiculosTempoReal(): Promise<VeiculoTempoReal[]> {
  return [];
}