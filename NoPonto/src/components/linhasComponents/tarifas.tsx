import { useTema } from "@/src/hooks/useTema";
import { Banknote, CircleDollarSign, CreditCard } from "lucide-react-native";
import { Text, View } from "react-native";

interface Props {
  valor?: number;
  modal?: string;
}

interface FormaPagamentoProps {
  label: string;
  cor: string;
  bgCor: string;
  bordaCor?: string;
  icon: React.ReactNode;
}

function Tag({ label, cor, bgCor, bordaCor, icon }: FormaPagamentoProps) {
  return (
    <View
      className="flex-row items-center px-3 py-1 rounded-full mr-2"
      style={{
        backgroundColor: bgCor,
        borderWidth: bordaCor ? 1 : 0,
        borderColor: bordaCor,
      }}
    >
      {icon}
      <Text className="text-xs font-semibold ml-1.5" style={{ color: cor }}>
        {label}
      </Text>
    </View>
  );
}

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number) {
  return (
    "#" +
    [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")
  );
}

function misturar(hex: string, fundo: string, alpha: number) {
  const c = hexToRgb(hex);
  const f = hexToRgb(fundo);
  return rgbToHex(
    c.r * alpha + f.r * (1 - alpha),
    c.g * alpha + f.g * (1 - alpha),
    c.b * alpha + f.b * (1 - alpha),
  );
}

const formasDePagamento = {
  onibus: [
    { label: "Dinheiro", cor: "#038B0F", bgCor: "#D5EBD7", icone: "banknote" },
    { label: "Jaé", cor: "#EA790F", bgCor: "#F1EAD4", icone: "card" },
  ],
  brt: [{ label: "Jaé", cor: "#EA790F", bgCor: "#F1EAD4", icone: "card" }],
  trem: [
    { label: "RioCard", cor: "#1156EA", bgCor: "#D7E2EF", icone: "card" },
    { label: "Dinheiro", cor: "#038B0F", bgCor: "#D5EBD7", icone: "banknote" },
    { label: "Pix", cor: "#31b5a8", bgCor: "#d0fffaff", icone: "pix" },
  ],
  metro: [
    { label: "RioCard", cor: "#1156EA", bgCor: "#D7E2EF", icone: "card" },
    { label: "Dinheiro", cor: "#038B0F", bgCor: "#D5EBD7", icone: "banknote" },
    { label: "Jaé", cor: "#EA790F", bgCor: "#F1EAD4", icone: "card" },
  ],
};

export default function Tarifas(props: Props) {
  const { cores, temaAtual } = useTema();
  const isDark = temaAtual === "escuro";

  const modalKey = (props.modal?.toLowerCase() ??
    "onibus") as keyof typeof formasDePagamento;
  const pagamentos = formasDePagamento[modalKey] ?? formasDePagamento.onibus;

  return (
    <View
      className="m-5 mt-0 rounded-2xl shadow-md overflow-hidden"
      style={{
        backgroundColor: cores.fundoCard,
        borderColor: cores.borda,
        borderWidth: 1,
      }}
    >
      {/* Tarifa */}
      <View
        className="p-4 flex-row items-center"
        style={{ borderBottomColor: cores.bordaSuave, borderBottomWidth: 1 }}
      >
        <Banknote color={cores.iconeSecundario} size={20} />
        <Text
          className="font-semibold ml-3 flex-1"
          style={{ color: cores.textoPrimario }}
        >
          Tarifa
        </Text>
        <Text className="font-semibold" style={{ color: cores.textoPrimario }}>
          R$ {props.valor?.toFixed(2).replace(".", ",") ?? "—"}
        </Text>
      </View>

      {/* Formas de pagamento */}
      <View className="p-4 flex-row flex-wrap">
        {pagamentos.map((p) => (
          <Tag
            key={p.label}
            label={p.label}
            cor={p.cor}
            bgCor={isDark ? misturar(p.bgCor, cores.fundoCard, 0.2) : p.bgCor}
            bordaCor={isDark ? misturar(p.bgCor, cores.borda, 0.5) : undefined}
            icon={
              p.icone === "banknote" ? (
                <Banknote color={p.cor} size={14} />
              ) : p.icone === "pix" ? (
                <CircleDollarSign color={p.cor} size={14} />
              ) : (
                <CreditCard color={p.cor} size={14} />
              )
            }
          />
        ))}
      </View>
    </View>
  );
}
