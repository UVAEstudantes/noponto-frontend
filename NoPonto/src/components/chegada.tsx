import { View, Text } from "react-native";
import { BusFront, HistoryIcon, Hourglass } from "lucide-react-native";

interface Props {
  intervalo?: string;
}

export default function Chegada(props: Props) {
  return (
    <View className="m-5 mt-0 bg-white rounded-2xl h-[145px] shadow-md">
      {/* header */}
      <View className=" p-4 bg-customBlack rounded-t-2xl">
        <HistoryIcon
          color="#FFC107"
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderColor: "#ffffff",
            marginLeft: 18,
            marginTop: 12,
          }}
        />

        <View>
          <Text className="color-white font-semibold px-[40px]">
            Chegada Estimada
          </Text>
          <Text className="absolute right-0 color-customYellow px-[10px]">
            Apróx. 5 minutos
          </Text>
        </View>
      </View>

      {/* proxima viagem */}
      <View className=" p-4 rounded-t-2xl ">
        <BusFront
          color="#8E8E93"
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderColor: "#ffffff",
            marginLeft: 18,
            marginTop: 12,
          }}
        />

        <View>
          <Text className="color-customBlack font-semibold px-[40px]">
            Próxima Viagem
          </Text>
          <Text className="absolute right-0 color-customBlack font-semibold px-[10px]">
            14:30
          </Text>
        </View>
      </View>

      {/* intervalo */}
      <View className=" p-4 rounded-t-2xl border-t border-gray-200">
        <Hourglass
          color="#8E8E93"
          style={{
            position: "absolute",
            width: 20,
            height: 20,
            borderColor: "#ffffff",
            marginLeft: 18,
            marginTop: 12,
          }}
        />

        <View>
          <Text className="color-customBlack font-semibold px-[40px]">
            Intervalo
          </Text>
          <Text className="absolute right-0 color-customBlack font-semibold px-[10px]">
            {props.intervalo}
          </Text>
        </View>
      </View>
    </View>
  );
}
