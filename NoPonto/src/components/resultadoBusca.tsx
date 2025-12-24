import { Pressable, ScrollView, Text } from "react-native";
import Animated, { FadeInUp, LinearTransition } from "react-native-reanimated";

interface Props {
  data: Array<{ id: number; nome: string; sentido: string }>;
  listaSelecionada: (item: {
    id: number;
    nome: string;
    sentido: string;
  }) => void;
  className?: string;
  maxHeight?: number;
}

export default function ResultadoBusca(props: Props) {
  const maxHeight = props.maxHeight || 400;
  const itemHeight = 72; // altura aproximada de cada item (p-4 + texto)
  const calculatedHeight = Math.min(props.data.length * itemHeight, maxHeight);

  return (
    <Animated.View
      entering={FadeInUp.duration(400).springify()}
      layout={LinearTransition}
      className={props.className}
      style={{ height: calculatedHeight }}
    >
      <ScrollView
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
      >
        {props.data.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => props.listaSelecionada(item)}
            className="p-4 border-b border-gray-100 active:bg-gray-200"
          >
            <Text className="text-lg font-semibold">{item.nome}</Text>
            <Text className="text-gray-500 text-sm">{item.sentido}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}
