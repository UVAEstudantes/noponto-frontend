import {
  Bus,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Train,
  TrainFront,
  X,
} from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const maxLinhasView = 5;

interface LinhaSelecionada {
  nome: string;
  modal: string;
  cor: string;
  ativa: boolean;
}

interface Props {
  linhasSelecionadas: LinhaSelecionada[];
  aoRemoverLinha: (nome: string) => void;
  aoToggleAtiva: (nome: string) => void;
  aberto: boolean;
  aoToggleAberto: () => void;
}

// Função para escurecer uma cor hex
const escurecerCor = (hex: string, percent: number = 40): string => {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - percent / 100));
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - percent / 100));
  const b = Math.max(0, (num & 0xff) * (1 - percent / 100));
  return (
    "#" +
    ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b))
      .toString(16)
      .slice(1)
  );
};

// Função para clarear uma cor hex
const clarearCor = (hex: string, percent: number = 80): string => {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(
    255,
    ((num >> 16) & 0xff) + (255 - ((num >> 16) & 0xff)) * (percent / 100)
  );
  const g = Math.min(
    255,
    ((num >> 8) & 0xff) + (255 - ((num >> 8) & 0xff)) * (percent / 100)
  );
  const b = Math.min(
    255,
    (num & 0xff) + (255 - (num & 0xff)) * (percent / 100)
  );
  return (
    "#" +
    ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b))
      .toString(16)
      .slice(1)
  );
};

const obterIconeModal = (modal: string, cor: string) => {
  const modalLower = modal.toLowerCase();
  const corEscura = escurecerCor(cor);

  switch (modalLower) {
    case "onibus":
      return <Bus color={corEscura} size={18} />;
    case "brt":
      return <Bus color={corEscura} size={18} />;
    case "trem":
      return <Train color={corEscura} size={18} />;
    case "metro":
      return <TrainFront color={corEscura} size={18} />;
    default:
      return null;
  }
};

const LinhasContainer = ({
  linhasSelecionadas,
  aoRemoverLinha,
  aoToggleAtiva,
  aberto,
  aoToggleAberto,
}: Props) => {
  const larguraContainer = 250;
  const translateX = useSharedValue(-larguraContainer);

  const estiloAnimado = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const estiloAnimadoBotao = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value + larguraContainer - 10 }],
    };
  });

  React.useEffect(() => {
    translateX.value = withSpring(aberto ? 0 : -larguraContainer, {
      damping: 35,
      stiffness: 120,
    });
  }, [aberto]);

  return (
    <>
      {/* Botão toggle na lateral - acompanha o container */}
      <Animated.View
        style={[estiloAnimadoBotao]}
        className="absolute top-[20%] left-0 z-[1]"
      >
        <Pressable onPress={aoToggleAberto}>
          <View className="rounded-r-full bg-white w-[50px] h-[60px] shadow-lg items-center justify-center">
            {aberto ? (
              <ChevronLeft color={"#FFC107"} size={30} strokeWidth={4} />
            ) : (
              <ChevronRight color={"#FFC107"} size={30} strokeWidth={4} />
            )}
          </View>
        </Pressable>
      </Animated.View>

      {/* Container das linhas */}
      <Animated.View
        style={[estiloAnimado, { width: larguraContainer }]}
        className="absolute top-[20%] left-0 rounded-r-lg h-[60%] bg-white shadow-2xl z-10"
      >
        <View className="flex-1 p-4">
          {/* Header */}
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-lg font-bold text-gray-800">
              Linhas Selecionadas
            </Text>
            <Text className="text-sm text-gray-500">
              {linhasSelecionadas.length}/{maxLinhasView}
            </Text>
          </View>

          {/* Lista de linhas */}
          <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
            {linhasSelecionadas.length === 0 ? (
              <View className="flex-1 items-center justify-center py-8">
                <Text className="text-gray-400 text-center">
                  Nenhuma linha selecionada{"\n"}
                  Busque e selecione linhas
                </Text>
              </View>
            ) : (
              linhasSelecionadas.map((linha) => (
                <View
                  key={linha.nome}
                  className={`mb-2 p-2 rounded-lg border flex-row items-center ${
                    linha.ativa
                      ? "border-gray-300 bg-white"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  {/* Ícone do modal com fundo colorido */}
                  <View
                    className="w-8 h-8 rounded-md items-center justify-center mr-2"
                    style={{ backgroundColor: clarearCor(linha.cor) }}
                  >
                    {obterIconeModal(linha.modal, linha.cor)}
                  </View>

                  {/* Nome da linha */}
                  <Text
                    className={`font-bold text-sm flex-1 ${
                      linha.ativa ? "text-gray-800" : "text-gray-400"
                    }`}
                  >
                    {linha.nome}
                  </Text>

                  {/* Botões de ação */}
                  <View className="flex-row gap-1">
                    {/* Ativar/Desativar */}
                    <Pressable
                      onPress={() => aoToggleAtiva(linha.nome)}
                      className="p-1.5 rounded-lg bg-gray-100"
                    >
                      {linha.ativa ? (
                        <Eye color="#666" size={16} />
                      ) : (
                        <EyeOff color="#999" size={16} />
                      )}
                    </Pressable>

                    {/* Remover */}
                    <Pressable
                      onPress={() => aoRemoverLinha(linha.nome)}
                      className="p-1.5 rounded-lg bg-red-100"
                    >
                      <X color="#ef4444" size={16} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Animated.View>
    </>
  );
};

export default LinhasContainer;
