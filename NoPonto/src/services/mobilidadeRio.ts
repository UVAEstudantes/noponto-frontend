import {
  CoordenadaMapa,
  ItinerarioLinha,
  LinhaTempoReal,
  ModalApiTransporte,
  VeiculoTempoReal,
} from "@/src/types/transporte";

const URL_GPS_BRT = "https://dados.mobilidade.rio/gps/brt";
const URL_GPS_SPPO = "https://dados.mobilidade.rio/gps/sppo";
const URL_ITINERARIO_SPPO =
  "https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Hosted/Itiner%C3%A1rios_da_rede_de_transporte_p%C3%BAblico_por_%C3%B4nibus_(SPPO)/FeatureServer/1/query";

type BrtApiVeiculo = {
  codigo?: string;
  placa?: string;
  linha?: string;
  latitude?: number;
  longitude?: number;
  dataHora?: number;
  velocidade?: number;
  sentido?: string;
  trajeto?: string;
  direcao?: number | string;
};

type BrtApiResposta = {
  veiculos?: BrtApiVeiculo[];
};

type SppoApiVeiculo = {
  ordem?: string;
  latitude?: string;
  longitude?: string;
  datahora?: string;
  velocidade?: string;
  linha?: string;
  datahoraenvio?: string;
  datahoraservidor?: string;
};

type ArcGisFeature = {
  geometry?: {
    type?: string;
    coordinates?: [number, number][];
  };
  properties?: {
    servico?: string;
    direcao?: string;
    destino?: string;
  };
};

type ArcGisGeoJson = {
  features?: ArcGisFeature[];
};

const FORMATADOR_NUMERICO = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

const CHAVE_INTERVALO = "Atualizacao ~20s";
const TARIFA_PADRAO = 4.7;

function normalizarNumero(valor: unknown): number | null {
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }

  if (typeof valor === "string") {
    const normalizado = valor.replace(",", ".").trim();
    if (!normalizado) {
      return null;
    }

    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : null;
  }

  return null;
}

function normalizarLinhaSppo(linha: string | undefined): string | null {
  if (!linha) {
    return null;
  }

  const valor = linha.trim().toUpperCase();
  if (!valor) {
    return null;
  }

  if (
    valor === "GARAGEM" ||
    valor === "CIRCULAR GARAGEM" ||
    valor === "SEM SERVICO"
  ) {
    return null;
  }

  if (!/[0-9]/.test(valor)) {
    return null;
  }

  return valor;
}

function normalizarLinhaBrt(linha: string | undefined): string | null {
  if (!linha) {
    return null;
  }

  const valor = linha.trim().toUpperCase();
  if (!valor || valor === "0") {
    return null;
  }

  return valor;
}

function formatarDataSppo(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  const segundo = String(data.getSeconds()).padStart(2, "0");

  return `${ano}-${mes}-${dia} ${hora}:${minuto}:${segundo}`;
}

function normalizarSentido(sentido: string | undefined): string {
  if (!sentido) {
    return "";
  }

  const valor = sentido.trim().toLowerCase();
  if (valor === "ida") {
    return "ida";
  }
  if (valor === "volta") {
    return "volta";
  }

  return "";
}

function normalizarDestino(destino: string | undefined): string | undefined {
  if (!destino) {
    return undefined;
  }

  const valor = destino.trim();
  return valor || undefined;
}

function listaServicosPossiveis(linhaOriginal: string): string[] {
  const linha = linhaOriginal.trim().toUpperCase().replace(/\s+/g, "");
  const resultados = new Set<string>([linha]);

  const matchComPrefixo = linha.match(/^(SN|SV|SP|LECD)(\d+)$/);
  const apenasNumero = linha.match(/^(\d+)$/);

  if (matchComPrefixo) {
    const numero = matchComPrefixo[2];
    resultados.add(numero);
    resultados.add(`SN${numero}`);
    resultados.add(`SV${numero}`);
    resultados.add(`SP${numero}`);
    resultados.add(`LECD${numero}`);
  }

  if (apenasNumero) {
    const numero = apenasNumero[1];
    resultados.add(`SN${numero}`);
    resultados.add(`SV${numero}`);
    resultados.add(`SP${numero}`);
    resultados.add(`LECD${numero}`);
  }

  return Array.from(resultados).filter(Boolean);
}

function ordenarLinhas(a: LinhaTempoReal, b: LinhaTempoReal) {
  if (a.modal !== b.modal) {
    return a.modal.localeCompare(b.modal);
  }

  return FORMATADOR_NUMERICO.compare(a.nome, b.nome);
}

function construirSentidoLinha(veiculos: VeiculoTempoReal[]): string {
  const sentidos = new Set<string>();

  veiculos.forEach((veiculo) => {
    const sentido = normalizarSentido(veiculo.sentido);
    if (sentido) {
      sentidos.add(sentido);
    }
  });

  if (sentidos.has("ida") && sentidos.has("volta")) {
    return "Ida ↔ Volta";
  }

  if (sentidos.has("ida")) {
    return "Ida ↔ Volta";
  }

  if (sentidos.has("volta")) {
    return "Ida ↔ Volta";
  }

  return "Ida ↔ Volta";
}

export function chaveLinhaModal(
  linha: string,
  modal: ModalApiTransporte,
): string {
  return `${modal}:${linha.trim().toUpperCase()}`;
}

export async function buscarVeiculosBrt(): Promise<VeiculoTempoReal[]> {
  const resposta = await fetch(URL_GPS_BRT);
  if (!resposta.ok) {
    throw new Error("Nao foi possivel carregar os veiculos do BRT.");
  }

  const dados = (await resposta.json()) as BrtApiResposta;
  const veiculos = Array.isArray(dados.veiculos) ? dados.veiculos : [];

  const listaNormalizada: VeiculoTempoReal[] = [];

  veiculos.forEach((item) => {
    const linha = normalizarLinhaBrt(item.linha);
    const latitude = normalizarNumero(item.latitude);
    const longitude = normalizarNumero(item.longitude);

    if (!linha || latitude === null || longitude === null) {
      return;
    }

    const direcao = normalizarNumero(item.direcao);
    const velocidade = normalizarNumero(item.velocidade) ?? 0;
    const timestamp = normalizarNumero(item.dataHora) ?? Date.now();

    listaNormalizada.push({
      id: item.codigo?.trim() || item.placa?.trim() || `brt-${linha}-${timestamp}`,
      modal: "brt",
      linha,
      latitude,
      longitude,
      velocidade,
      timestamp,
      direcao,
      sentido: normalizarSentido(item.sentido),
      trajeto: item.trajeto?.trim() || undefined,
    });
  });

  return listaNormalizada;
}

export async function buscarVeiculosSppo(
  intervaloMinutos = 2,
): Promise<VeiculoTempoReal[]> {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - intervaloMinutos * 60_000);

  const params = new URLSearchParams({
    dataInicial: formatarDataSppo(inicio),
    dataFinal: formatarDataSppo(fim),
  });

  const resposta = await fetch(`${URL_GPS_SPPO}?${params.toString()}`);
  if (!resposta.ok) {
    throw new Error("Nao foi possivel carregar os veiculos de onibus.");
  }

  const dados = (await resposta.json()) as SppoApiVeiculo[];
  const registros = Array.isArray(dados) ? dados : [];

  const maisRecentePorVeiculo = new Map<string, VeiculoTempoReal>();

  registros.forEach((item) => {
    const linha = normalizarLinhaSppo(item.linha);
    const latitude = normalizarNumero(item.latitude);
    const longitude = normalizarNumero(item.longitude);

    if (!linha || latitude === null || longitude === null) {
      return;
    }

    const idVeiculo = item.ordem?.trim();
    if (!idVeiculo) {
      return;
    }

    const timestamp =
      normalizarNumero(item.datahoraenvio) ??
      normalizarNumero(item.datahoraservidor) ??
      normalizarNumero(item.datahora) ??
      Date.now();

    const velocidade = normalizarNumero(item.velocidade) ?? 0;

    const chave = `onibus:${idVeiculo}`;
    const atual = maisRecentePorVeiculo.get(chave);

    if (!atual || timestamp >= atual.timestamp) {
      maisRecentePorVeiculo.set(chave, {
        id: idVeiculo,
        modal: "onibus",
        linha,
        latitude,
        longitude,
        velocidade,
        timestamp,
        direcao: null,
      });
    }
  });

  return Array.from(maisRecentePorVeiculo.values());
}

export async function buscarVeiculosTempoReal(): Promise<VeiculoTempoReal[]> {
  const [onibus, brt] = await Promise.all([
    buscarVeiculosSppo(),
    buscarVeiculosBrt(),
  ]);

  return [...onibus, ...brt];
}

export function construirLinhasDisponiveis(
  veiculos: VeiculoTempoReal[],
): LinhaTempoReal[] {
  const grupos = new Map<string, VeiculoTempoReal[]>();

  veiculos.forEach((veiculo) => {
    const chave = chaveLinhaModal(veiculo.linha, veiculo.modal);
    const listaAtual = grupos.get(chave) ?? [];
    listaAtual.push(veiculo);
    grupos.set(chave, listaAtual);
  });

  const linhas: LinhaTempoReal[] = Array.from(grupos.entries()).map(
    ([chave, lista]) => {
      const [modal, nome] = chave.split(":") as [ModalApiTransporte, string];
      return {
        id: chave,
        nome,
        modal,
        sentido: construirSentidoLinha(lista),
        intervalo: CHAVE_INTERVALO,
        tarifa: TARIFA_PADRAO,
      };
    },
  );

  return linhas.sort(ordenarLinhas);
}

export async function buscarItinerarioLinha(
  linha: string,
  modal: ModalApiTransporte,
): Promise<ItinerarioLinha | null> {
  const servicos = listaServicosPossiveis(linha);
  const where = servicos.map((servico) => `servico='${servico}'`).join(" OR ");

  const params = new URLSearchParams({
    outFields: "servico,direcao,destino,consorcio,tipo_dia",
    where,
    f: "geojson",
  });

  const resposta = await fetch(`${URL_ITINERARIO_SPPO}?${params.toString()}`);
  if (!resposta.ok) {
    return null;
  }

  const dados = (await resposta.json()) as ArcGisGeoJson;
  const features = Array.isArray(dados.features) ? dados.features : [];

  const melhorTrechoPorDirecao = new Map<string, CoordenadaMapa[]>();
  const destinoPorDirecao = new Map<string, string>();

  features.forEach((feature) => {
    if (feature.geometry?.type !== "LineString") {
      return;
    }

    const coordenadas = Array.isArray(feature.geometry.coordinates)
      ? feature.geometry.coordinates
      : [];

    const trecho: CoordenadaMapa[] = coordenadas
      .map((ponto) => {
        const longitude = normalizarNumero(ponto[0]);
        const latitude = normalizarNumero(ponto[1]);

        if (latitude === null || longitude === null) {
          return null;
        }

        return [latitude, longitude] as CoordenadaMapa;
      })
      .filter((ponto): ponto is CoordenadaMapa => Boolean(ponto));

    if (trecho.length < 2) {
      return;
    }

    const direcao = feature.properties?.direcao === "1" ? "1" : "0";
    const atual = melhorTrechoPorDirecao.get(direcao);

    if (!atual || trecho.length > atual.length) {
      melhorTrechoPorDirecao.set(direcao, trecho);

      const destino = normalizarDestino(feature.properties?.destino);
      if (destino) {
        destinoPorDirecao.set(direcao, destino);
      }
      return;
    }

    if (!destinoPorDirecao.has(direcao)) {
      const destino = normalizarDestino(feature.properties?.destino);
      if (destino) {
        destinoPorDirecao.set(direcao, destino);
      }
    }
  });

  const ida = melhorTrechoPorDirecao.get("0");
  const volta = melhorTrechoPorDirecao.get("1");

  const segmentos = [ida, volta].filter(
    (segmento): segmento is CoordenadaMapa[] => Boolean(segmento?.length),
  );

  if (segmentos.length === 0) {
    return null;
  }

  return {
    linha: linha.trim().toUpperCase(),
    modal,
    segmentos,
    ida,
    volta,
    destinoIda: destinoPorDirecao.get("0"),
    destinoVolta: destinoPorDirecao.get("1"),
  };
}
