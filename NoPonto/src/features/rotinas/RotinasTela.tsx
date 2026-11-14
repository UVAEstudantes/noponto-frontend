import React, { useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CalendarDays,
  Clock3,
  Repeat2,
  SlidersHorizontal,
} from "lucide-react-native";
import {
  BotaoDemo,
  PainelDemo,
  useVisualDemo,
} from "@/src/components/demo/InterfaceDemo";
import {
  exemplosRotinas,
  formatarHoraRotina,
  Rotina,
  salvarRotinaLocal,
} from "@/src/services/rotinasDemo";
import {
  diasRotina,
  FormularioRotina,
  SeletorHorario,
} from "./FormularioRotina";
import {
  EsquemaPercurso,
  ExplicacaoRotinas,
  PreviaPercurso,
} from "./PercursoRotina";

type Painel = "formulario" | "horario" | "percurso" | "ajuda" | null;
export default function RotinasTela() {
  const { cores, texto, secundario, card } = useVisualDemo();
  const [rotinas, setRotinas] = useState(exemplosRotinas);
  const [draft, setDraft] = useState<Rotina | null>(null);
  const [painel, setPainel] = useState<Painel>(null);
  const [previa, setPrevia] = useState<Rotina | null>(null);
  const [tempo, setTempo] = useState<[number, number]>([7, 0]);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const abrir = (r?: Rotina) => {
    setErro("");
    setFeedback("");
    setDraft(
      r
        ? { ...r, dias: [...r.dias] }
        : {
            id: Date.now(),
            nome: "",
            origem: "",
            destino: "",
            dias: [0, 1, 2, 3, 4],
            hora: "07:00",
            voz: true,
            ativa: false,
          },
    );
    setPainel("formulario");
  };
  const verPercurso = (r: Rotina) => {
    Keyboard.dismiss();
    setPrevia(r);
    setPainel("percurso");
  };
  const voltar = () => {
    if ((painel === "horario" || painel === "percurso") && draft)
      setPainel("formulario");
    else {
      setPainel(null);
      setDraft(null);
    }
  };
  const salvar = () => {
    if (!draft) return;
    try {
      setRotinas(salvarRotinaLocal(rotinas, draft));
      setDraft(null);
      setPainel(null);
      setFeedback("Rotina salva nesta prévia local.");
    } catch (e) {
      setErro((e as Error).message);
    }
  };
  const titulos = {
    formulario: "Sua rotina",
    horario: "Escolher horário",
    percurso: previa?.nome ?? "Percurso",
    ajuda: "O que são Rotinas?",
  };
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: cores.fundoApp }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 130, gap: 14 }}
      >
        <Text
          accessibilityRole="header"
          style={[texto, { fontSize: 30, fontWeight: "800" }]}
        >
          Rotinas
        </Text>
        <Text style={secundario}>
          Seus caminhos de sempre, com ajuda em cada etapa.
        </Text>
        <View style={card}>
          <Text style={[texto, { fontSize: 18, fontWeight: "800" }]}>
            Seu caminho, acompanhado do início ao fim.
          </Text>
          <EsquemaPercurso />
          <BotaoDemo secundario onPress={() => setPainel("ajuda")}>
            Entenda as Rotinas
          </BotaoDemo>
        </View>
        <BotaoDemo onPress={() => abrir()}>Criar rotina</BotaoDemo>
        <Text style={secundario}>
          Prévia interativa · exemplos ilustrativos, sem viagens calculadas ou
          alertas reais.
        </Text>
        {!!feedback && (
          <Text accessibilityLiveRegion="polite" style={texto}>
            {feedback}
          </Text>
        )}
        <Text style={[texto, { fontSize: 21, fontWeight: "800" }]}>
          Minhas rotinas
        </Text>
        {!rotinas.length && (
          <View style={card}>
            <Repeat2 color="#B48200" size={30} />
            <Text style={[texto, { fontSize: 19, fontWeight: "800" }]}>
              Seu próximo caminho começa aqui
            </Text>
            <Text style={secundario}>
              Organize um trajeto habitual e explore como o NoPonto poderá
              ajudar.
            </Text>
            <BotaoDemo onPress={() => abrir()}>Criar primeira rotina</BotaoDemo>
          </View>
        )}
        {rotinas.map((r) => (
          <View key={r.id} style={card}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[texto, { fontSize: 21, fontWeight: "800" }]}>
                  {r.nome}
                </Text>
                <Text
                  style={[
                    secundario,
                    { color: r.ativa ? cores.sucesso : secundario.color },
                  ]}
                >
                  {r.ativa ? "Ativa na prévia" : "Pausada"}
                </Text>
              </View>
              <Switch
                accessibilityLabel={`Ativar ${r.nome} na demonstração`}
                value={r.ativa}
                trackColor={{ true: "#D69C00" }}
                onValueChange={(ativa) =>
                  setRotinas((list) =>
                    list.map((item) =>
                      item.id === r.id ? { ...item, ativa } : item,
                    ),
                  )
                }
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Configurar rotina ${r.nome}`}
                onPress={() => abrir(r)}
                android_ripple={{ color: "#80808030", borderless: true }}
                style={{
                  width: 44,
                  minHeight: 48,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <SlidersHorizontal size={21} color={cores.textoPrimario} />
              </Pressable>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text style={[texto, { flex: 1 }]}>{r.origem}</Text>
              <Text style={{ color: "#159875" }}>● ─── ●</Text>
              <Text
                style={[
                  texto,
                  { flex: 1, textAlign: "right", fontWeight: "600" },
                ]}
              >
                {r.destino}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <CalendarDays size={16} color={secundario.color} />
              <Text style={secundario}>
                {r.dias.join() === "0,1,2,3,4"
                  ? "Dias úteis"
                  : r.dias.map((d) => diasRotina[d]).join(" · ")}
              </Text>
              <Clock3 size={16} color={secundario.color} />
              <Text style={[texto, { fontWeight: "800" }]}>{r.hora}</Text>
            </View>
            <Text style={secundario}>A pé · ônibus · trem · exemplo</Text>
            <BotaoDemo
              secundario
              label={`Ver percurso ${r.nome}`}
              onPress={() => verPercurso(r)}
            >
              Ver percurso →
            </BotaoDemo>
          </View>
        ))}
      </ScrollView>
      {painel && (
        <PainelDemo
          titulo={titulos[painel]}
          onFechar={voltar}
          amplo={painel === "formulario"}
          rodape={
            painel === "formulario" ? (
              <BotaoDemo onPress={salvar}>Salvar rotina</BotaoDemo>
            ) : painel === "horario" ? (
              <View style={{ gap: 8 }}>
                <BotaoDemo
                  onPress={() => {
                    if (draft)
                      setDraft({
                        ...draft,
                        hora: formatarHoraRotina(...tempo),
                      });
                    setPainel("formulario");
                  }}
                >
                  Confirmar horário
                </BotaoDemo>
                <BotaoDemo secundario onPress={voltar}>
                  Cancelar
                </BotaoDemo>
              </View>
            ) : (
              <BotaoDemo secundario onPress={voltar}>
                {draft ? "Voltar à configuração" : "Voltar às Rotinas"}
              </BotaoDemo>
            )
          }
        >
          {painel === "formulario" && draft && (
            <>
              <FormularioRotina
                rotina={draft}
                atualizar={setDraft}
                erro={erro}
                horario={() => {
                  Keyboard.dismiss();
                  setTempo(
                    draft.hora.split(":").map(Number) as [number, number],
                  );
                  setPainel("horario");
                }}
                previa={() => verPercurso(draft)}
              />
              {rotinas.some((r) => r.id === draft.id) && (
                <BotaoDemo
                  secundario
                  onPress={() => {
                    setRotinas((list) => list.filter((r) => r.id !== draft.id));
                    setDraft(null);
                    setPainel(null);
                    setFeedback("Rotina removida da demonstração.");
                  }}
                >
                  Remover rotina da prévia
                </BotaoDemo>
              )}
            </>
          )}
          {painel === "horario" && (
            <SeletorHorario tempo={tempo} onChange={setTempo} />
          )}
          {painel === "percurso" && previa && (
            <PreviaPercurso key={previa.id} rotina={previa} />
          )}
          {painel === "ajuda" && <ExplicacaoRotinas />}
        </PainelDemo>
      )}
    </SafeAreaView>
  );
}
