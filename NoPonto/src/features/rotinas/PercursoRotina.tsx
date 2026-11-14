import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  BusFront,
  Footprints,
  TrainFront,
  Home,
  MapPin,
  CalendarDays,
  Radio,
  Volume2,
  TriangleAlert,
  Route,
  BellRing,
} from "lucide-react-native";
import { BotaoDemo, useVisualDemo } from "@/src/components/demo/InterfaceDemo";
import { etapasRotina, Rotina } from "@/src/services/rotinasDemo";

export function EsquemaPercurso() {
  const { cores } = useVisualDemo();
  return (
    <View
      accessible
      accessibilityLabel="Esquema ilustrativo: origem, caminhada, ônibus, trem e destino"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingVertical: 6,
      }}
    >
      {[Home, Footprints, BusFront, TrainFront, MapPin].map((Icon, i) => (
        <React.Fragment key={i}>
          <Icon
            size={i === 0 || i === 4 ? 18 : 21}
            color={i === 0 ? "#159875" : cores.textoPrimario}
          />
          {i < 4 && (
            <View
              style={{ flex: 1, height: 2, backgroundColor: cores.borda }}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}
const estados = [
  "Preparando a viagem",
  "Aguardando embarque",
  "Em deslocamento",
  "Próxima descida",
  "Integração",
  "Chegada",
];
export function PreviaPercurso({ rotina }: { rotina: Rotina }) {
  const { cores, texto, secundario } = useVisualDemo();
  const [estado, setEstado] = useState(0);
  const [expandida, setExpandida] = useState<number | null>(0);
  const [alternativa, setAlternativa] = useState(false);
  return (
    <>
      <Text style={[texto, { fontSize: 19, fontWeight: "700" }]}>
        {rotina.origem} → {rotina.destino}
      </Text>
      <Text style={secundario}>
        Prévia ilustrativa. Sem rota calculada, transporte ao vivo ou
        estimativas reais.
      </Text>
      <EsquemaPercurso />
      <View
        style={{
          borderRadius: 14,
          padding: 12,
          backgroundColor: cores.fundoApp,
          gap: 8,
        }}
      >
        <Text style={[secundario, { fontWeight: "600" }]}>
          ACOMPANHAMENTO · DEMONSTRAÇÃO
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[texto, { fontWeight: "800" }]}
        >
          {estados[estado]}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <BotaoDemo
              secundario
              disabled={estado === 0}
              label="Estado anterior"
              onPress={() => setEstado((v) => v - 1)}
            >
              ← Anterior
            </BotaoDemo>
          </View>
          <View style={{ flex: 1 }}>
            <BotaoDemo
              secundario
              disabled={estado === 5}
              label="Próximo estado"
              onPress={() => setEstado((v) => v + 1)}
            >
              Próximo →
            </BotaoDemo>
          </View>
        </View>
      </View>
      <Text style={[texto, { fontWeight: "700" }]}>
        Etapas · toque para ver detalhes
      </Text>
      {etapasRotina(rotina, alternativa).map((etapa, i) => {
        const Icon =
          etapa.tipo === "Caminhada"
            ? Footprints
            : etapa.tipo.startsWith("Trem")
              ? TrainFront
              : BusFront;
        const aberta = expandida === i;
        return (
          <View key={i} style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ alignItems: "center", width: 32 }}>
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: cores.fundoApp,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={18} color={cores.textoPrimario} />
              </View>
              {i < 4 && (
                <View
                  style={{
                    flex: 1,
                    width: 2,
                    minHeight: 16,
                    backgroundColor: cores.borda,
                  }}
                />
              )}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Etapa ${i + 1}: ${etapa.tipo}`}
              accessibilityState={{ expanded: aberta }}
              onPress={() => setExpandida(aberta ? null : i)}
              android_ripple={{ color: "#80808020" }}
              style={{ flex: 1, minHeight: 48, paddingBottom: 10, gap: 4 }}
            >
              <Text style={[texto, { fontWeight: "700" }]}>
                {i + 1}. {etapa.tipo}
              </Text>
              <Text style={secundario}>{etapa.ate}</Text>
              {aberta && (
                <View style={{ gap: 5, paddingTop: 4 }}>
                  <Text style={secundario}>De: {etapa.de}</Text>
                  <Text style={texto}>{etapa.instrucao}</Text>
                  <Text style={secundario}>
                    Etapa ilustrativa · sem acompanhamento real
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        );
      })}
      <View
        style={{
          padding: 12,
          borderWidth: 1,
          borderColor: cores.borda,
          borderRadius: 15,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TriangleAlert size={20} color="#B48200" />
          <Text style={[texto, { flex: 1, fontWeight: "700" }]}>
            Possível atraso em um trecho
          </Text>
        </View>
        <Text style={secundario}>
          Exemplo de aviso futuro. Não há ocorrência real associada a esta
          prévia.
        </Text>
        <BotaoDemo secundario onPress={() => setAlternativa((v) => !v)}>
          {alternativa ? "Voltar ao percurso original" : "Ver alternativa"}
        </BotaoDemo>
        {alternativa && (
          <Text accessibilityLiveRegion="polite" style={secundario}>
            Alternativa ilustrativa: o primeiro transporte muda para metrô. A
            viabilidade dependerá do futuro motor de rotas.
          </Text>
        )}
      </View>
    </>
  );
}

const explicacoes = [
  [
    Route,
    "Planeje seu caminho",
    "Escolha origem, destino e os dias habituais. A futura rota combinará caminhada, ônibus, BRT, trem ou metrô.",
  ],
  [
    CalendarDays,
    "Prepare sua saída",
    "O NoPonto poderá observar a aproximação dos veículos relevantes antes do horário e ajudar você a se preparar.",
  ],
  [
    Radio,
    "Siga seu trajeto",
    "Cada trecho poderá aparecer no mapa: onde embarcar, caminhar, integrar e descer.",
  ],
  [
    BellRing,
    "Receba orientações",
    "Avisos de embarque e aproximação da descida poderão acompanhar o andamento da viagem, inclusive por voz.",
  ],
  [
    TriangleAlert,
    "Saiba de problemas",
    "Atrasos e interrupções só poderão orientar decisões quando houver dados confiáveis. Um relato isolado não será tratado como fato confirmado.",
  ],
  [
    Volume2,
    "Considere alternativas",
    "O futuro motor de rotas poderá comparar outros caminhos viáveis. A voz ajudará a acompanhar as orientações sem atenção constante à tela.",
  ],
] as const;
export function ExplicacaoRotinas() {
  const { cores, texto, secundario } = useVisualDemo();
  return (
    <>
      <Text style={[texto, { fontSize: 22, fontWeight: "800" }]}>
        Seu caminho, acompanhado do início ao fim.
      </Text>
      <EsquemaPercurso />
      {explicacoes.map(([Icon, titulo, descricao], i) => (
        <View key={titulo} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ alignItems: "center", width: 32 }}>
            <Icon size={23} color={cores.textoPrimario} />
            {i < 5 && (
              <View
                style={{
                  width: 1,
                  flex: 1,
                  backgroundColor: cores.borda,
                  marginTop: 10,
                }}
              />
            )}
          </View>
          <View style={{ flex: 1, gap: 5, paddingBottom: 8 }}>
            <Text style={[texto, { fontSize: 16, fontWeight: "800" }]}>
              {i + 1}. {titulo}
            </Text>
            <Text style={secundario}>{descricao}</Text>
          </View>
        </View>
      ))}
      <Text style={secundario}>
        Funcionalidade em desenvolvimento — prévia ilustrativa. Hoje não há
        rotas calculadas, monitoramento, alertas ou alternativas reais para
        Rotinas.
      </Text>
    </>
  );
}
