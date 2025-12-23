import { Banknote, CreditCardIcon } from "lucide-react-native";
import { View, Text } from "react-native";
import { Float } from "react-native/Libraries/Types/CodegenTypes";

interface Props {
  valor?: number;
  modal?: String;
}

function rioCard() {
  return (
    <View className="bg-[#D7E2EF] w-[95px] ml-3 mr-3 pl-2 flex-row rounded-full items-center py-1 ">
      <CreditCardIcon color="#1156EA" size={18} style={{ marginLeft: 5 }} />
      <Text className="ml-2 text-sm font-semibold">RioCard</Text>
    </View>
  );
}
function dinheiro() {
  return (
    <View className="bg-[#D5EBD7] w-[100px] ml-3 mr-3 pl-2 flex-row rounded-full items-center py-1">
      <Banknote color="#038B0F" size={18} style={{ marginLeft: 5 }} />
      <Text className="ml-2 text-sm font-semibold">Dinheiro</Text>
    </View>
  );
}
function jae() {
  return (
    <View className="bg-[#F1EAD4] w-[70px] ml-3 mr-3 pl-2 flex-row rounded-full items-center py-1">
      <CreditCardIcon color="#EA790F" size={18} style={{ marginLeft: 5 }} />
      <Text className="ml-2 text-sm font-semibold">Jaé</Text>
    </View>
  );
}

const formasDePagamento = {
  onibus: [dinheiro, jae],
  brt: [jae],
  trem: [rioCard, dinheiro],
  metro: [rioCard, dinheiro, jae],
};

export default function Tarifas(props: Props) {
  const pagamentos =
    formasDePagamento[props.modal as keyof typeof formasDePagamento];

  return (
    <View className="m-5 mt-0 bg-white rounded-2xl h-[95px] shadow-md">
      {/* header */}
      <View className=" p-4 rounded-t-2xl">
        <Banknote
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
            Tarifa
          </Text>
          <Text className="absolute right-0 color-customBlack font-semibold px-[10px]">
            R$ {props.valor?.toFixed(2).replace(".", ",")}
          </Text>
        </View>
      </View>

      {/* formas de pagamento */}
      <View className=" p-4 pl-1 rounded-t-2xl border-t border-gray-200 flex-row ">
        {pagamentos.map((FormaDePagamento, index) => (
          <FormaDePagamento key={index} />
        ))}
      </View>
    </View>
  );
}
