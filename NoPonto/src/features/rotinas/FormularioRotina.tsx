import React from "react";
import {
  Pressable,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ArrowDownUp,
  BellRing,
  Clock3,
  Route,
  Volume2,
} from "lucide-react-native";
import {
  BotaoDemo,
  CampoDemo,
  useVisualDemo,
} from "@/src/components/demo/InterfaceDemo";
import { formatarHoraRotina, Rotina } from "@/src/services/rotinasDemo";

export const diasRotina = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
export function FormularioRotina({
  rotina: r,
  atualizar,
  horario,
  previa,
  erro,
}: {
  rotina: Rotina;
  atualizar: (r: Rotina) => void;
  horario: () => void;
  previa: () => void;
  erro: string;
}) {
  const { cores, texto, secundario } = useVisualDemo();
  const { width, fontScale } = useWindowDimensions();
  const sete = width >= 390 && fontScale <= 1.15;
  const faixas = sete
    ? [diasRotina]
    : [diasRotina.slice(0, 4), diasRotina.slice(4)];
  const titulo = (n: string, label: string) => (
    <Text style={[texto, { fontSize: 18, fontWeight: "800" }]}>
      <Text style={{ color: "#B07E00" }}>{n} </Text>
      {label}
    </Text>
  );
  return (
    <>
      <Text style={secundario}>
        Prévia local. Os locais não são validados geograficamente e nenhum aviso
        será enviado.
      </Text>
      {titulo("1", "Seu trajeto")}
      <CampoDemo
        label="Nome da rotina"
        value={r.nome}
        onChangeText={(nome) => atualizar({ ...r, nome })}
      />
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <View
          style={{
            width: 14,
            alignItems: "center",
            alignSelf: "stretch",
            paddingVertical: 34,
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              borderWidth: 2,
              borderColor: "#159875",
            }}
          />
          <View
            style={{
              width: 2,
              flex: 1,
              minHeight: 40,
              backgroundColor: cores.borda,
            }}
          />
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: "#D39D00",
            }}
          />
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          <CampoDemo
            label="Origem"
            value={r.origem}
            onChangeText={(origem) => atualizar({ ...r, origem })}
          />
          <CampoDemo
            label="Destino"
            value={r.destino}
            onChangeText={(destino) => atualizar({ ...r, destino })}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Inverter origem e destino"
          onPress={() =>
            atualizar({ ...r, origem: r.destino, destino: r.origem })
          }
          android_ripple={{ color: "#80808030", borderless: true }}
          style={{
            width: 44,
            minHeight: 48,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: cores.fundoApp,
          }}
        >
          <ArrowDownUp size={20} color={cores.textoPrimario} />
        </Pressable>
      </View>
      <BotaoDemo secundario onPress={previa}>
        Ver percurso ilustrativo
      </BotaoDemo>
      {titulo("2", "Dias e horário")}
      <View style={{ gap: 6 }}>
        {faixas.map((faixa, index) => (
          <View
            key={index}
            style={{ flexDirection: "row", justifyContent: "center", gap: 4 }}
          >
            {faixa.map((dia) => {
              const d = diasRotina.indexOf(dia);
              const checked = r.dias.includes(d);
              return (
                <Pressable
                  key={dia}
                  accessibilityRole="checkbox"
                  accessibilityLabel={dia}
                  accessibilityState={{ checked }}
                  onPress={() =>
                    atualizar({
                      ...r,
                      dias: checked
                        ? r.dias.filter((i) => i !== d)
                        : [...r.dias, d].sort(),
                    })
                  }
                  android_ripple={{ color: "#D69C0030" }}
                  style={{
                    flex: sete ? 1 : undefined,
                    width: sete ? undefined : Math.min(58, (width - 70) / 4),
                    minHeight: 48,
                    paddingVertical: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 12,
                    backgroundColor: checked ? "#FFC107" : cores.fundoApp,
                    borderWidth: 1,
                    borderColor: checked ? "#D69C00" : cores.borda,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: checked ? "#302600" : cores.textoPrimario,
                    }}
                  >
                    {dia}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Selecionar horário"
        onPress={horario}
        android_ripple={{ color: "#80808020" }}
        style={{
          minHeight: 52,
          borderWidth: 1,
          borderColor: cores.borda,
          borderRadius: 13,
          padding: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Clock3 size={21} color={cores.textoPrimario} />
        <View style={{ flex: 1 }}>
          <Text style={texto}>Horário habitual</Text>
          <Text style={secundario}>Toda semana, nos dias escolhidos</Text>
        </View>
        <Text style={[texto, { fontSize: 22, fontWeight: "800" }]}>
          {r.hora}
        </Text>
      </Pressable>
      {titulo("3", "Assistência na viagem")}
      <Text style={secundario}>Preferências da experiência futura</Text>
      {(
        [
          [
            "avisos",
            "Embarque e descida",
            "Avisos para preparar cada etapa",
            BellRing,
          ],
          [
            "alternativas",
            "Problemas e alternativas",
            "Sugestões quando houver dados confiáveis",
            Route,
          ],
          [
            "voz",
            "Assistente de voz",
            "Orientações sem olhar para a tela",
            Volume2,
          ],
        ] as const
      ).map(([key, label, info, Icon]) => (
        <View
          key={key}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderBottomWidth: 1,
            borderColor: cores.bordaSuave,
            paddingBottom: 10,
          }}
        >
          <Icon size={21} color={cores.textoPrimario} />
          <View style={{ flex: 1 }}>
            <Text style={[texto, { fontWeight: "600" }]}>{label}</Text>
            <Text style={secundario}>{info}</Text>
          </View>
          <Switch
            accessibilityLabel={label}
            value={r[key] ?? true}
            onValueChange={(v) => atualizar({ ...r, [key]: v })}
            trackColor={{ true: "#D69C00" }}
          />
        </View>
      ))}
      {titulo("4", "Revisão")}
      <Text style={texto}>
        {r.origem || "Origem"} → {r.destino || "Destino"}
        {"\n"}
        {r.dias.map((d) => diasRotina[d]).join(" · ") ||
          "Escolha os dias"} · {r.hora}
      </Text>
      {!!erro && (
        <Text accessibilityRole="alert" style={{ color: cores.perigo }}>
          {erro}
        </Text>
      )}
    </>
  );
}

export function SeletorHorario({
  tempo,
  onChange,
}: {
  tempo: [number, number];
  onChange: (t: [number, number]) => void;
}) {
  const { cores, texto, secundario } = useVisualDemo();
  return (
    <>
      <Text
        style={[
          texto,
          {
            fontSize: 38,
            fontWeight: "800",
            textAlign: "center",
            fontVariant: ["tabular-nums"],
          },
        ]}
      >
        {formatarHoraRotina(...tempo)}
      </Text>
      <Text style={[secundario, { textAlign: "center" }]}>
        Ajuste a hora e os minutos. O horário só muda ao confirmar.
      </Text>
      <View style={{ gap: 10 }}>
        {([24, 60] as const).map((max, c) => (
          <View
            key={c}
            style={{
              flexDirection: "row",
              gap: 8,
              alignItems: "center",
              padding: 10,
              borderRadius: 16,
              backgroundColor: cores.fundoApp,
            }}
          >
            <Text style={[secundario, { flex: 1, fontWeight: "700" }]}>
              {c === 0 ? "Hora" : "Minuto"}
            </Text>
            <View style={{ width: 44 }}>
              <BotaoDemo
                secundario
                label={c === 0 ? "Diminuir hora" : "Diminuir minuto"}
                onPress={() =>
                  onChange(
                    c === 0
                      ? [(tempo[0] + max - 1) % max, tempo[1]]
                      : [tempo[0], (tempo[1] + max - 1) % max],
                  )
                }
              >
                −
              </BotaoDemo>
            </View>
            <Text
              accessibilityLiveRegion="polite"
              style={[
                texto,
                {
                  minWidth: 46,
                  textAlign: "center",
                  fontSize: 28,
                  fontWeight: "700",
                  fontVariant: ["tabular-nums"],
                },
              ]}
            >
              {String(tempo[c]).padStart(2, "0")}
            </Text>
            <View style={{ width: 44 }}>
              <BotaoDemo
                secundario
                label={c === 0 ? "Aumentar hora" : "Aumentar minuto"}
                onPress={() =>
                  onChange(
                    c === 0
                      ? [(tempo[0] + 1) % max, tempo[1]]
                      : [tempo[0], (tempo[1] + 1) % max],
                  )
                }
              >
                ＋
              </BotaoDemo>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}
