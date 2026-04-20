// container usado na tela de linhas para mostrar a chegada estimada e proxima viagem

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
      className="m-5 mt-0 rounded-2xl h-[145px] shadow-md"
      style={{
        backgroundColor: cores.fundoCard,
        borderColor: cores.borda,
        borderWidth: 1,
      }}
    >
      {/* header */}
      <View
        className=" p-4 rounded-t-2xl"
        style={{ backgroundColor: cores.fundoNav }}
      >
        <HistoryIcon
          color={cores.iconePrimario}
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderColor: cores.borda,
            marginLeft: 18,
            marginTop: 12,
          }}
        />

        <View>
          <Text
            className="font-semibold px-[40px]"
            style={{ color: cores.textoInverso }}
          >
            Chegada Estimada
          </Text>
          <Text
            className="absolute right-0 px-[10px]"
            style={{ color: cores.textoDestaque }}
          >
            Apróx. 5 minutos
          </Text>
        </View>
      </View>

      {/* proxima viagem */}
      <View className=" p-4 rounded-t-2xl ">
        <BusFront
          color={cores.iconeSecundario}
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderColor: cores.borda,
            marginLeft: 18,
            marginTop: 12,
          }}
        />

        <View>
          <Text
            className="font-semibold px-[40px]"
            style={{ color: cores.textoPrimario }}
          >
            Próxima Viagem
          </Text>
          <Text
            className="absolute right-0 font-semibold px-[10px]"
            style={{ color: cores.textoPrimario }}
          >
            14:30
          </Text>
        </View>
      </View>

      {/* intervalo */}
      <View
        className=" p-4 rounded-t-2xl border-t"
        style={{ borderColor: cores.borda }}
      >
        <Hourglass
          color={cores.iconeSecundario}
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderColor: cores.borda,
            marginLeft: 18,
            marginTop: 12,
          }}
        />

        <View>
          <Text
            className="font-semibold px-[40px]"
            style={{ color: cores.textoPrimario }}
          >
            Intervalo
          </Text>
          <Text
            className="absolute right-0 font-semibold px-[10px]"
            style={{ color: cores.textoPrimario }}
          >
            {props.intervalo}
          </Text>
        </View>
      </View>
    </View>
  );
}
