import {
  familiasIndicadores,
  type ModalIndicador,
  type EstiloIndicador,
} from "../constants/indicadores";

/** Autossuficiente: a mesma funcao roda no app (previews) e na WebView. */
export function criarRenderizadorIndicadores(
  catalogo: typeof familiasIndicadores,
) {
  const cache = new Map<
    string,
    {
      svg: string;
      uri: string;
      largura: number;
      altura: number;
      ancoraY: number;
      orientacao: number;
    }
  >();
  // Pictogramas vetoriais locais; nao dependem do CDN de icones do mapa.
  const pictogramas = {
    onibus:
      '<rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 3v8M16 3v8M7 19v2M17 19v2"/><path d="M8 15h.01M16 15h.01" stroke-width="3"/>',
    brt: '<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M5 8h3v4H5zM16 8h3v4h-3zM11 6v11M13 6v11"/><circle cx="6" cy="19" r="1"/><circle cx="18" cy="19" r="1"/>',
    trem: '<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M9 3h6M8 18l-3 3M16 18l3 3M7 21h10"/><path d="M8 14h.01M16 14h.01" stroke-width="3"/>',
  };
  return function renderizar(
    estilo: EstiloIndicador,
    modal: ModalIndicador,
    cor: string,
  ) {
    // Somente hex: cores das linhas sao selecionadas pela paleta do app.
    const color = /^#[0-9a-f]{6}$/i.test(cor)
      ? cor
      : /^#[0-9a-f]{3}$/i.test(cor)
        ? "#" +
          cor
            .slice(1)
            .split("")
            .map(function (c) {
              return c + c;
            })
            .join("")
        : "#FFC400";
    const key = estilo + ":" + modal + ":" + color.toLowerCase();
    const anterior = cache.get(key);
    if (anterior) return anterior;
    const a = catalogo[estilo].assets[modal];
    let svg = a.svg
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(
        /(<g\b[^>]*\bid="carroceria"[^>]*\bfill=")[^"]*(")/,
        "$1" + color + "$2",
      );
    // Os assets realistas usam acentos amarelos fixos em paineis/contornos.
    // Converte apenas esses acentos para tons da carroceria; vidros e lanternas ficam intactos.
    const rgb = [1, 3, 5].map(function (i) {
      return parseInt(color.slice(i, i + 2), 16);
    });
    svg = svg.replace(
      /#(?:604100|885000|ac7000|805200|a76d00|855600|6f4b00|926000)\b/gi,
      function (tom) {
        const fator =
          Math.max(
            parseInt(tom.slice(1, 3), 16),
            parseInt(tom.slice(3, 5), 16),
            parseInt(tom.slice(5, 7), 16),
          ) / 255;
        return (
          "#" +
          rgb
            .map(function (c) {
              return Math.round(c * fator)
                .toString(16)
                .padStart(2, "0");
            })
            .join("")
        );
      },
    );
    if (a.pictograma) {
      const canais = rgb.map(function (c) {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      const luminancia =
        0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
      const contraste = luminancia > 0.179 ? "#111827" : "#FFFFFF";
      svg = svg.replace(
        /<\/svg>\s*$/,
        '<g transform="translate(18 16) scale(1.1666667)" fill="none" stroke="' +
          contraste +
          '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          pictogramas[modal] +
          "</g></svg>",
      );
    }
    const resultado = {
      svg,
      uri: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
      largura: a.largura,
      altura: a.altura,
      ancoraY: a.ancoraY,
      orientacao: a.orientacao,
    };
    if (cache.size >= 256) cache.delete(cache.keys().next().value!);
    cache.set(key, resultado);
    return resultado;
  };
}
export const renderizarIndicador =
  criarRenderizadorIndicadores(familiasIndicadores);
