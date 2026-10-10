import { useTema } from "@/src/hooks/useTema";
import { Banknote, CreditCard, Wallet, Landmark, Smartphone, QrCode } from "lucide-react-native";
import { resolverTarifa, type TarifaResolvida } from "@/src/services/tarifas";
import { apresentarPagamento, type IconePagamento } from "@/src/utils/apresentacaoPagamento";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

interface Props {
  linhaId: string;
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
      className="flex-row items-center px-3 py-1 rounded-full mr-2 mb-2"
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

const iconesPagamento = {
  "credit-card": CreditCard, wallet: Wallet, banknote: Banknote,
  landmark: Landmark, smartphone: Smartphone, "qr-code": QrCode,
} satisfies Record<IconePagamento, typeof Wallet>;

export default function Tarifas(props: Props) {
  const { cores, temaAtual } = useTema();
  const isDark = temaAtual === "escuro";
  const [consulta, setConsulta] = useState<{
    linhaId: string; estado: "carregando" | "sucesso" | "erro"; dados: TarifaResolvida | null;
  }>({ linhaId: props.linhaId, estado: "carregando", dados: null });
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let ativa = true;
    setConsulta({ linhaId: props.linhaId, estado: "carregando", dados: null });
    resolverTarifa(props.linhaId, controller.signal)
      .then((dados) => {
        if (ativa) setConsulta({ linhaId: props.linhaId, estado: "sucesso", dados });
      })
      .catch(() => {
        if (ativa) setConsulta({ linhaId: props.linhaId, estado: "erro", dados: null });
      });
    return () => { ativa = false; controller.abort(); };
  }, [props.linhaId, tentativa]);
  // Também bloqueia o valor anterior no render anterior à execução do effect.
  const estado = consulta.linhaId === props.linhaId ? consulta.estado : "carregando";
  const textoValor = estado === "carregando" ? "Consultando…"
    : estado === "erro" ? "Tarifa indisponível"
    : consulta.dados?.tarifa.valor == null ? "Sem valor registrado"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(consulta.dados!.tarifa.valor!);

  const pagamentos = estado === "sucesso" ? consulta.dados?.formasPagamento ?? [] : [];

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
        {estado === "carregando" && <ActivityIndicator size="small" color={cores.iconeSecundario}
          style={{ marginRight: 8 }} />}
        <Text accessibilityLiveRegion="polite" className="font-semibold"
          style={{ color: cores.textoPrimario, flexShrink: 1, textAlign: "right" }}>
          {textoValor}
        </Text>
      </View>

      {estado === "erro" && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tentar consultar a tarifa novamente"
            onPress={() => {
              setConsulta({ linhaId: props.linhaId, estado: "carregando", dados: null });
              setTentativa((valor) => valor + 1);
            }} style={{ minHeight: 44, justifyContent: "center" }}>
            <Text style={{ fontSize: 12, color: cores.textoPrimario, fontWeight: "600" }}>Tentar novamente</Text>
          </Pressable>
        </View>
      )}

      {/* Formas de pagamento */}
      <View className="p-4 flex-row flex-wrap">
        {estado === "carregando" && <Text style={{ color: cores.textoSecundario }}>Consultando métodos de pagamento…</Text>}
        {estado === "erro" && <Text style={{ color: cores.textoSecundario }}>Métodos de pagamento indisponíveis</Text>}
        {estado === "sucesso" && pagamentos.length === 0 &&
          <Text style={{ color: cores.textoSecundario }}>Métodos de pagamento não informados</Text>}
        {pagamentos.map((pagamento) => {
          const visual = apresentarPagamento(pagamento, cores.fundoCard, isDark);
          const Icon = iconesPagamento[visual.icone];
          return <Tag key={pagamento.id} label={pagamento.nome}
            cor={visual.cor} bgCor={visual.fundo} bordaCor={visual.borda}
            icon={<Icon color={visual.cor} size={14} />} />;
        })}
      </View>
    </View>
  );
}
