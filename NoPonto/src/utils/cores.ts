// Paleta de cores vibrantes para diferenciar as linhas
const CORES_DISPONIVEIS = [
  "#E74C3C", // Vermelho
  "#3498DB", // Azul
  "#2ECC71", // Verde
  "#F39C12", // Laranja
  "#9B59B6", // Roxo
  "#1ABC9C", // Turquesa
  "#E67E22", // Laranja escuro
  "#34495E", // Azul escuro
  "#16A085", // Verde água
  "#D35400", // Laranja queimado
  "#C0392B", // Vermelho escuro
  "#8E44AD", // Roxo escuro
  "#27AE60", // Verde escuro
  "#2980B9", // Azul médio
  "#F1C40F", // Amarelo
];

// Função para gerar uma cor aleatória da paleta
export const gerarCorAleatoria = (coresEmUso: string[] = []): string => {
  const coresDisponiveis = CORES_DISPONIVEIS.filter(
    (cor) => !coresEmUso.includes(cor),
  );

  if (coresDisponiveis.length === 0) {
    // Se todas as cores estão em uso, retorna uma cor aleatória da paleta completa
    return CORES_DISPONIVEIS[
      Math.floor(Math.random() * CORES_DISPONIVEIS.length)
    ];
  }

  return coresDisponiveis[Math.floor(Math.random() * coresDisponiveis.length)];
};

// Função para obter uma cor específica pelo índice (útil para testes)
export const obterCorPorIndice = (indice: number): string => {
  return CORES_DISPONIVEIS[indice % CORES_DISPONIVEIS.length];
};

// Converte cor hex para rgba com opacidade
export const hexParaRgba = (hex: string, opacity: number = 1): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};
