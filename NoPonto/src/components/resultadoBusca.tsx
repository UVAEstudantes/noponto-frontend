import { Pressable, ScrollView, Text, ViewStyle } from "react-native";
import Animated, { FadeInUp, LinearTransition } from "react-native-reanimated";
import { useTema } from "@/src/hooks/useTema";

interface ItemResultadoBusca {
  id: number | string;
  nome: string;
  sentido: string;
}

interface Props<T extends ItemResultadoBusca> {
  data: T[];
  listaSelecionada: (item: T) => void;
  className?: string;
  style?: ViewStyle;
  maxHeight?: number;
}

export default function ResultadoBusca<T extends ItemResultadoBusca>(
  props: Props<T>,
) {
  const { cores } = useTema();
  const maxHeight = props.maxHeight || 400;
  const itemHeight = 72;
  const calculatedHeight = Math.min(props.data.length * itemHeight, maxHeight);

  return (
    <Animated.View
      entering={FadeInUp.duration(400).springify()}
      layout={LinearTransition}
      className={props.className}
      style={[
        {
          height: calculatedHeight,
          backgroundColor: cores.fundoCard,
          borderColor: cores.borda,
          borderWidth: 1,
        },
        props.style,
      ]}
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
            className="p-4"
            style={{
              borderBottomColor: cores.bordaSuave,
              borderBottomWidth: 1,
            }}
          >
            <Text
              className="text-lg font-semibold"
              style={{ color: cores.textoPrimario }}
            >
              {item.nome}
            </Text>
            <Text className="text-sm" style={{ color: cores.textoSecundario }}>
              {item.sentido}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}