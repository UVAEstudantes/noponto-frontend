import React from "react";
import { Text, View } from "react-native";
import {
  Award,
  BusFront,
  CalendarDays,
  Clock3,
  Coins,
  Footprints,
  LockKeyhole,
  Route,
  TrainFront,
} from "lucide-react-native";
import { useVisualDemo } from "@/src/components/demo/InterfaceDemo";
import { iniciaisPerfil, PerfilLocal } from "./perfilLocal";

export function AvatarIniciais({
  perfil,
  tamanho = 62,
}: {
  perfil: PerfilLocal;
  tamanho?: number;
}) {
  return (
    <View
      accessibilityLabel={`Avatar ${iniciaisPerfil(perfil.nome)}`}
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: tamanho / 2,
        backgroundColor: perfil.cor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{ color: "#FFFFFF", fontSize: tamanho / 3, fontWeight: "800" }}
        maxFontSizeMultiplier={1.4}
      >
        {iniciaisPerfil(perfil.nome)}
      </Text>
    </View>
  );
}

// Um conjunto coerente e isolado de exemplos; não deriva de GPS, favoritos ou histórico do aparelho.
const indicadores = [
  [Clock3, "18 h", "Em transporte", "no mês de exemplo"],
  [Route, "24", "Viagens", "no mês de exemplo"],
  [Footprints, "96 km", "Distância", "transporte + caminhada"],
  [Coins, "R$ 120", "Gasto estimado", "sem tarifas reais"],
  [BusFront, "6", "Linhas diferentes", "no mês de exemplo"],
  [CalendarDays, "5", "Dias ativos", "semana de exemplo"],
] as const;
export function ResumoMobilidade() {
  const { texto, secundario, card } = useVisualDemo();
  return (
    <>
      <Text style={[texto, { fontSize: 21, fontWeight: "800" }]}>
        Sua mobilidade em números
      </Text>
      <Text style={secundario}>
        Demonstração · todos os números, rankings e conquistas abaixo são
        ilustrativos. Nenhuma viagem é coletada pelo Perfil.
      </Text>
      <View style={{ gap: 10 }}>
        {[0, 2, 4].map((start) => (
          <View key={start} style={{ flexDirection: "row", gap: 10 }}>
            {indicadores
              .slice(start, start + 2)
              .map(([Icon, valor, nome, unidade]) => (
                <View
                  key={nome}
                  style={[card, { flex: 1, minWidth: 0, padding: 13, gap: 6 }]}
                >
                  <Icon size={21} color="#B48200" />
                  <Text style={[texto, { fontSize: 25, fontWeight: "800" }]}>
                    {valor}
                  </Text>
                  <Text style={[texto, { fontWeight: "600" }]}>{nome}</Text>
                  <Text style={secundario}>{unidade}</Text>
                </View>
              ))}
          </View>
        ))}
      </View>
    </>
  );
}

const ranking = [
  { codigo: "838", nome: "Ônibus · exemplo", peso: 45 },
  { codigo: "855", nome: "Ônibus · exemplo", peso: 30 },
  { codigo: "Santa Cruz", nome: "Trem · exemplo", peso: 25 },
];
export function EstatisticasPerfil() {
  const { cores, texto, secundario, card } = useVisualDemo();
  return (
    <>
      <View style={card}>
        <Text style={[texto, { fontSize: 19, fontWeight: "800" }]}>
          Linhas mais usadas
        </Text>
        <Text style={secundario}>Ranking demonstrativo · sem rastreamento</Text>
        {ranking.map((l, i) => (
          <View key={l.codigo} style={{ gap: 6 }}>
            <View
              style={{ flexDirection: "row", gap: 8, alignItems: "center" }}
            >
              <Text style={secundario}>{i + 1}</Text>
              <Text style={[texto, { fontWeight: "800", flex: 1 }]}>
                {l.codigo}
              </Text>
              <Text style={secundario}>{l.peso}%</Text>
            </View>
            <Text style={secundario}>{l.nome}</Text>
            <View
              style={{
                height: 5,
                borderRadius: 3,
                backgroundColor: cores.fundoApp,
              }}
            >
              <View
                style={{
                  width: `${l.peso}%`,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: "#D3A01A",
                }}
              />
            </View>
          </View>
        ))}
      </View>
      <View style={card}>
        <Text style={[texto, { fontSize: 19, fontWeight: "800" }]}>
          Seu ritmo na semana
        </Text>
        <Text style={secundario}>Atividade e modais · dados ilustrativos</Text>
        <View
          accessible
          accessibilityLabel="Atividade de exemplo: segunda 4, terça 6, quarta 2, quinta 5, sexta 7, sábado e domingo sem viagens"
          style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}
        >
          {[4, 6, 2, 5, 7, 0, 0].map((n, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: 8 }}>
              <View
                style={{ height: 72, justifyContent: "flex-end", width: "70%" }}
              >
                <View
                  style={{
                    height: Math.max(3, n * 10),
                    backgroundColor: n ? "#159875" : cores.borda,
                    borderRadius: 4,
                  }}
                />
              </View>
              <Text style={secundario}>
                {["S", "T", "Q", "Q", "S", "S", "D"][i]}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["Ônibus 45%", "Trem 30%", "BRT 15%", "Metrô 10%"].map((m) => (
            <Text
              key={m}
              style={[
                secundario,
                {
                  backgroundColor: cores.fundoApp,
                  borderRadius: 8,
                  padding: 8,
                },
              ]}
            >
              {m}
            </Text>
          ))}
        </View>
      </View>
    </>
  );
}

const conquistas = [
  ["Primeira viagem", "O começo de uma nova jornada", true],
  ["Explorador de linhas", "Descubra caminhos diferentes", true],
  ["Viajante frequente", "Uma cidade de possibilidades", false],
  ["Conhecedor da cidade", "Novos lugares pelo transporte", false],
  ["Integrador de modais", "Conecte diferentes transportes", false],
] as const;
export function ConquistasPerfil() {
  const { cores, texto, secundario, card } = useVisualDemo();
  return (
    <View style={card}>
      <Text style={[texto, { fontSize: 19, fontWeight: "800" }]}>
        Conquistas
      </Text>
      <Text style={secundario}>
        Vitrine demonstrativa · estas insígnias não foram atribuídas a você.
      </Text>
      {conquistas.map(([nome, desc, aberta]) => (
        <View
          key={nome}
          style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: cores.fundoApp,
            }}
          >
            {aberta ? (
              <Award size={25} color="#B48200" />
            ) : (
              <LockKeyhole size={21} color={secundario.color} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[texto, { fontWeight: "700" }]}>{nome}</Text>
            <Text style={secundario}>
              {desc} ·{" "}
              {aberta ? "desbloqueada no exemplo" : "bloqueada no exemplo"}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function FavoritaPerfil({
  codigo,
  nome,
  modal,
}: {
  codigo: string;
  nome: string;
  modal: string;
}) {
  const { cores, texto, secundario } = useVisualDemo();
  const Icon = modal === "trem" || modal === "metro" ? TrainFront : BusFront;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderColor: cores.bordaSuave,
      }}
    >
      <Icon size={21} color={cores.textoPrimario} />
      <View style={{ flex: 1 }}>
        <Text style={[texto, { fontWeight: "800" }]}>{codigo}</Text>
        <Text style={secundario}>{nome}</Text>
        <Text style={secundario}>
          {(
            {
              onibus: "Ônibus",
              brt: "BRT",
              trem: "Trem",
              metro: "Metrô",
            } as Record<string, string>
          )[modal] ?? modal}
        </Text>
      </View>
    </View>
  );
}
