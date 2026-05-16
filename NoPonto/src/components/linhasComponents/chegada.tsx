import { useTema } from "@/src/hooks/useTema";
import { BusFront, HistoryIcon, Hourglass } from "lucide-react-native";
import { Text, View } from "react-native";

interface Props {
  intervalo?: string;
}

export default function Chegada(props: Props) {
  const { cores, temaAtual } = useTema();
  const headerText =
    temaAtual === "escuro" ? cores.textoPrimario : cores.textoInverso;
  const headerAccent =
    temaAtual === "escuro" ? cores.textoDestaque : cores.iconePrimario;

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
        <HistoryIcon color={headerAccent} size={20} />
        <Text
          className="font-semibold ml-3 flex-1"
          style={{ color: headerText }}
        >
          Chegada Estimada
        </Text>
        <Text className="font-semibold" style={{ color: headerAccent }}>
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
        <Text className="font-semibold" style={{ color: cores.textoPrimario }}>
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
        <Text className="font-semibold" style={{ color: cores.textoPrimario }}>
          {props.intervalo}
        </Text>
      </View>
    </View>
  );
}
