export const ICONES_PAGAMENTO = ["credit-card", "wallet", "banknote", "landmark", "smartphone", "qr-code"] as const;
export type IconePagamento = typeof ICONES_PAGAMENTO[number];

function canais(hex: string) {
  return [1, 3, 5].map((inicio) => parseInt(hex.slice(inicio, inicio + 2), 16));
}

function misturar(cor: string, superficie: string, proporcao: number) {
  const fundo = canais(superficie);
  return "#" + canais(cor).map((canal, i) =>
    Math.round(canal * proporcao + fundo[i] * (1 - proporcao)).toString(16).padStart(2, "0")).join("");
}

function luminancia(hex: string) {
  const linear = canais(hex).map((canal) => {
    const valor = canal / 255;
    return valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastePagamento(a: string, b: string) {
  const valores = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (valores[0] + 0.05) / (valores[1] + 0.05);
}

export function apresentarPagamento(
  pagamento: { cor?: string | null; icone?: string | null }, superficie: string, escuro: boolean,
) {
  const base = /^#[0-9a-f]{6}$/i.test(pagamento.cor ?? "")
    ? pagamento.cor! : escuro ? "#AAB0B8" : "#626A73";
  const fundo = misturar(base, superficie, escuro ? 0.16 : 0.09);
  let cor = base;
  // Ajusta luminosidade rumo ao polo do tema, mantendo a tonalidade da cor base.
  for (let passo = 1; contrastePagamento(cor, fundo) < 4.5 && passo <= 100; passo++) {
    cor = misturar(base, escuro ? "#FFFFFF" : "#000000", 1 - passo / 100);
  }
  const icone = ICONES_PAGAMENTO.includes(pagamento.icone as IconePagamento)
    ? pagamento.icone as IconePagamento : "wallet";
  return { cor, fundo, borda: misturar(base, superficie, 0.3), icone };
}
