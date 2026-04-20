import {
  Banknote,
  CircleDollarSign,
  CreditCardIcon,
} from "lucide-react-native";
import { useTema } from "@/src/hooks/useTema";
import { View, Text } from "react-native";

interface Props {
  valor?: number;
  modal?: string;
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

function pix() {
  return (
    <View className="w-[70px] bg-[#d0fffaff] rounded-2xl items-center flex-row ml-3 mr-3 pl-2 py-1">
      <CircleDollarSign color="#31b5a8" size={18} style={{ marginLeft: 5 }} />
      <Text className="text-sm font-semibold ml-2">Pix</Text>
    </View>
  );
}

const formasDePagamento = {
  onibus: [dinheiro, jae],
  brt: [jae],
  trem: [rioCard, dinheiro, pix],
  metro: [rioCard, dinheiro, jae],
};

export default function Tarifas(props: Props) {
  const { cores } = useTema();

  const pagamentos =
    formasDePagamento[props.modal as keyof typeof formasDePagamento];

  return (
    <View
      className="m-5 mt-0 rounded-2xl h-[95px] shadow-md"
      style={{
        backgroundColor: cores.fundoCard,
        borderColor: cores.borda,
        borderWidth: 1,
      }}
    >
      {/* header */}
      <View className=" p-4 rounded-t-2xl">
        <Banknote
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
            Tarifa
          </Text>
          <Text
            className="absolute right-0 font-semibold px-[10px]"
            style={{ color: cores.textoPrimario }}
          >
            R$ {props.valor?.toFixed(2).replace(".", ",")}
          </Text>
        </View>
      </View>

      {/* formas de pagamento */}
      <View
        className=" p-4 pl-1 rounded-t-2xl border-t flex-row "
        style={{ borderColor: cores.borda }}
      >
        {pagamentos?.map((FormaDePagamento, index) => (
          <FormaDePagamento key={index} />
        ))}
      </View>
    </View>
  );
}
