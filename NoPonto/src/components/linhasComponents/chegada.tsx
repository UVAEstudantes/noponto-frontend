import { useTema } from "@/src/hooks/useTema";
import { View, Text } from "react-native";
import { BusFront, HistoryIcon, Hourglass } from "lucide-react-native";

interface Props {
  intervalo?: string;
}

export default function Chegada(props: Props) {
  const { cores } = useTema();

  return (
    <View
      className="m-5 mt-0 rounded-2xl shadow-md overflow-hidden"
      style={{
        backgroundColor: cores.fundoCard,
        borderColor: cores.borda,
        borderWidth: 1,
      }}
    >
      {/* header */}
      <View
        className="p-4 flex-row items-center"
        style={{ backgroundColor: cores.fundoNav }}
      >
        <HistoryIcon color={cores.iconePrimario} size={20} />
        <Text
          className="font-semibold ml-3 flex-1"
          style={{ color: cores.textoInverso }}
        >
          Chegada Estimada
        </Text>
        <Text
          className="font-semibold"
          style={{ color: cores.iconePrimario }}
        >
          Aprox. 5 minutos
        </Text>
      </View>

      {/* próxima viagem */}
      <View
        className="p-4 flex-row items-center"
        style={{ borderBottomColor: cores.bordaSuave, borderBottomWidth: 1 }}
      >
        <BusFront color={cores.iconeSecundario} size={20} />
        <Text
          className="font-semibold ml-3 flex-1"
          style={{ color: cores.textoPrimario }}
        >
          Próxima Viagem
        </Text>
        <Text
          className="font-semibold"
          style={{ color: cores.textoPrimario }}
        >
          14:30
        </Text>
      </View>

      {/* intervalo */}
      <View className="p-4 flex-row items-center">
        <Hourglass color={cores.iconeSecundario} size={20} />
        <Text
          className="font-semibold ml-3 flex-1"
          style={{ color: cores.textoPrimario }}
        >
          Intervalo
        </Text>
        <Text
          className="font-semibold"
          style={{ color: cores.textoPrimario }}
        >
          {props.intervalo}
        </Text>
      </View>
    </View>
  );
}