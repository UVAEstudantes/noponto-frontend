import { Bus, BusFront, Train, TrainFrontTunnel, Layers, Star } from "lucide-react-native";

const IDENTIDADE_MODAL = {
  todos: { Icon: Layers, cor: "#64748B", texto: "#475569" },
  favoritos: { Icon: Star, cor: "#F59E0B", texto: "#A65D00" },
  onibus: { Icon: BusFront, cor: "#F59E0B", texto: "#A65D00" },
  brt: { Icon: Bus, cor: "#0EA5E9", texto: "#036A99" },
  trem: { Icon: Train, cor: "#A855F7", texto: "#7E22CE" },
  metro: { Icon: TrainFrontTunnel, cor: "#14B8A6", texto: "#0F766E" },
};

export function identidadeModalMapa(id?: string | null) {
  return IDENTIDADE_MODAL[id as keyof typeof IDENTIDADE_MODAL] ?? IDENTIDADE_MODAL.onibus;
}
