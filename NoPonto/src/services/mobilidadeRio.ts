import {
    CoordenadaMapa,
    ItinerarioLinha,
    ItinerarioMapaDto,
    ItinerarioPorLinhaMapaDto,
    LinhaDetalhesDto,
    LinhaSimplesDto,
    LinhasResponse,
    LinhaTempoReal,
    ModalApiTransporte,
    OpcaoBusca,
    Parada,
    PoiDto,
    PoiParadaDto,
    PosicaoVeiculo,
    ProximoVeiculoParadaDto,
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

export async function buscarDetalhesLinha(
  linhaId: string,
): Promise<LinhaDetalhesDto | null> {
  const response = await api.get<LinhaDetalhesDto>(
    `/linhas/${linhaId}/detalhes`,
  );
  if (!response.ok || !response.data) return null;
  return response.data;
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
  incluirParadas: boolean = false,
): Promise<ItinerarioPorLinhaMapaDto | null> {
  const response = await api.get<ItinerarioPorLinhaMapaDto>(
    `/itinerarios/por-linha/${linhaId}/mapa`,
    { params: { incluirParadas } },
  );
  if (!response.ok || !response.data) return null;
  return response.data;
}

export async function buscarMapaPorItinerario(
  itinerarioId: string,
  incluirParadas: boolean = false,
): Promise<ItinerarioMapaDto | null> {
  const response = await api.get<ItinerarioMapaDto>(
    `/itinerarios/itinerario/${itinerarioId}/mapa`,
    { params: { incluirParadas } },
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
      ? `${linha.codigo} - ${linha.nome
          .replace(linha.codigo, "")
          .replace(/^[-\s]+/, "")
          .trim()}`
      : linha.nome,
  }));
}

// ─── Itinerário mesclado (ida + volta) ─────────────────────────────────────

export async function buscarItinerarioLinhaMesclado(
  linhaId: string,
  linhaCodigo: string,
  modal: ModalApiTransporte,
  incluirParadas: boolean = false,
): Promise<ItinerarioLinha | null> {
  const montarPorLinha = async (): Promise<ItinerarioLinha | null> => {
    const mapaLinha = await buscarMapaPorLinha(linhaId, incluirParadas);
    if (!mapaLinha || !mapaLinha.itinerarios?.length) return null;

    const segmentos: CoordenadaMapa[][] = [];
    const todasParadas: Parada[] = [];
    const paradasPorItinerario: Record<string, Parada[]> = {};
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

      if (incluirParadas) {
        if (it.itinerarioId) {
          paradasPorItinerario[it.itinerarioId] = it.paradas ?? [];
        }
        it.paradas?.forEach((parada) => {
          if (!todasParadas.some((p) => p.paradaId === parada.paradaId)) {
            todasParadas.push(parada);
          }
        });
      }
    });

    const filtrados = segmentos.filter(Boolean);
    if (filtrados.length === 0) return null;

    return {
      linha: linhaCodigo,
      modal,
      segmentos: filtrados,
      paradas: incluirParadas ? todasParadas : undefined,
      paradasPorItinerario: incluirParadas ? paradasPorItinerario : undefined,
      itinerarioIdIda,
      itinerarioIdVolta,
      incluiParadas: incluirParadas,
    };
  };

  const detalhes = await buscarDetalhesLinha(linhaId);
  if (!detalhes?.sentidos?.length) {
    return montarPorLinha();
  }

  let itinerarioIdIda: string | undefined;
  let itinerarioIdVolta: string | undefined;

  detalhes.sentidos.forEach((sentido) => {
    const tipo = tipoSentidoPorNome(sentido.nome);
    const itId = sentido.itinerarios?.[0]?.itinerarioId;
    if (!itId) return;
    if (tipo === "ida" && !itinerarioIdIda) itinerarioIdIda = itId;
    if (tipo === "volta" && !itinerarioIdVolta) itinerarioIdVolta = itId;
  });

  if (!itinerarioIdIda && !itinerarioIdVolta) {
    const lista = detalhes.sentidos.reduce(
      (acc, s) => acc.concat(s.itinerarios ?? []),
      [] as { itinerarioId: string }[],
    );
    itinerarioIdIda = lista[0]?.itinerarioId;
    itinerarioIdVolta = lista[1]?.itinerarioId;
  }

  const [mapaIda, mapaVolta] = await Promise.all([
    itinerarioIdIda
      ? buscarMapaPorItinerario(itinerarioIdIda, incluirParadas)
      : Promise.resolve(null),
    itinerarioIdVolta
      ? buscarMapaPorItinerario(itinerarioIdVolta, incluirParadas)
      : Promise.resolve(null),
  ]);

  const segmentos: CoordenadaMapa[][] = [];
  const todasParadas: Parada[] = [];
  const paradasPorItinerario: Record<string, Parada[]> = {};

  const adicionarMapa = (
    mapa: ItinerarioMapaDto | null,
    idx: number,
    itinerarioId?: string,
  ) => {
    if (!mapa) return;
    const coordenadas: CoordenadaMapa[] = (mapa.geometria ?? [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((g) => [g.latitude, g.longitude]);
    if (coordenadas.length === 0) return;
    segmentos[idx] = coordenadas;

    if (incluirParadas) {
      if (itinerarioId) {
        paradasPorItinerario[itinerarioId] = mapa.paradas ?? [];
      }
      mapa.paradas?.forEach((parada) => {
        if (!todasParadas.some((p) => p.paradaId === parada.paradaId)) {
          todasParadas.push(parada);
        }
      });
    }
  };

  adicionarMapa(mapaIda, 0, itinerarioIdIda);
  adicionarMapa(mapaVolta, 1, itinerarioIdVolta);

  const filtrados = segmentos.filter(Boolean);
  if (filtrados.length === 0) {
    return montarPorLinha();
  }

  return {
    linha: linhaCodigo,
    modal,
    segmentos: filtrados,
    paradas: incluirParadas ? todasParadas : undefined,
    paradasPorItinerario: incluirParadas ? paradasPorItinerario : undefined,
    itinerarioIdIda,
    itinerarioIdVolta,
    incluiParadas: incluirParadas,
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

export async function buscarPoisPorParada(
  paradaId: string,
): Promise<PoiParadaDto[]> {
  const response = await api.get<PoiParadaDto[]>(
    `/pois/por-parada/${paradaId}`,
  );
  if (!response.ok || !response.data) return [];
  return response.data;
}

// ─── /paradas ─────────────────────────────────────────────────────────────

export async function buscarProximosVeiculosParada(
  paradaId: string,
): Promise<ProximoVeiculoParadaDto[]> {
  const response = await api.get<ProximoVeiculoParadaDto[]>(
    `/paradas/${paradaId}/proximos-veiculos`,
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

  const linhas: LinhaTempoReal[] = Array.from(grupos.entries()).map(
    ([chave]) => {
      const [modal, nome] = chave.split(":") as [ModalApiTransporte, string];
      return {
        id: chave,
        nome,
        modal,
        sentido: "Ida ↔ Volta",
        intervalo: INTERVALO_PADRAO,
        tarifa: TARIFA_PADRAO,
      };
    },
  );

  return linhas.sort((a, b) => {
    if (a.modal !== b.modal) return a.modal.localeCompare(b.modal);
    return FORMATADOR_NUMERICO.compare(a.nome, b.nome);
  });
}

export async function buscarVeiculosTempoReal(): Promise<VeiculoTempoReal[]> {
  return [];
}

function tipoSentidoPorNome(nome?: string | null): "ida" | "volta" | null {
  if (!nome) return null;
  const n = nome.toLowerCase();
  if (n.includes("ida") || n.includes("(1)")) return "ida";
  if (n.includes("volta") || n.includes("(0)")) return "volta";
  return null;
}
