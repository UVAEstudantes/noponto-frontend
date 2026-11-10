import { formatarCodigoLinhaParaFala } from "@/src/services/preferenciasVozRadar";
import * as Speech from "expo-speech";
import { router } from "expo-router";
import { ArrowLeft, Check, Play, Square } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTema } from "@/src/hooks/useTema";

const frases = [
  "O ônibus da linha 838 está chegando à parada em três minutos.",
  "O BRT da linha 11 chega à estação em dois minutos.",
  "O próximo trem com destino à Central chega em cinco minutos.",
  "Atenção. A previsão da linha 855 foi atualizada para oito minutos.",
];

const velocidades = [
  { label: "0,85×", value: 0.85 },
  { label: "1×", value: 1 },
  { label: "1,15×", value: 1.15 },
] as const;

const tons = [
  { label: "Mais grave", value: 0.85 },
  { label: "Padrão", value: 1 },
  { label: "Mais agudo", value: 1.15 },
] as const;

type FiltroIdioma = "pt-br" | "pt-outros" | "en" | "es" | "todos";

const filtrosIdioma: { id: FiltroIdioma; label: string }[] = [
  { id: "pt-br", label: "Português (Brasil)" },
  { id: "pt-outros", label: "Português (outros)" },
  { id: "en", label: "Inglês" },
  { id: "es", label: "Espanhol" },
  { id: "todos", label: "Todos os idiomas" },
];

function categoriaIdioma(language: string): FiltroIdioma | "outros" {
  const idioma = language.replace(/_/g, "-").toLowerCase();
  if (idioma === "pt-br") return "pt-br";
  if (idioma === "pt" || idioma.startsWith("pt-")) return "pt-outros";
  if (idioma.startsWith("en")) return "en";
  if (idioma.startsWith("es")) return "es";
  return "outros";
}

function correspondeFiltro(filtro: FiltroIdioma, language: string) {
  return filtro === "todos" || categoriaIdioma(language) === filtro;
}

function nomeIdioma(language: string) {
  const idioma = language.replace(/_/g, "-").toLowerCase();
  if (idioma === "pt-br") return "Português (Brasil)";
  if (idioma.startsWith("pt")) return "Português";
  if (idioma.startsWith("en")) return "Inglês";
  if (idioma.startsWith("es")) return "Espanhol";
  return language || "Idioma desconhecido";
}

function nomeExibido(voice: Speech.Voice) {
  const name = voice.name.trim();
  return name && name !== voice.identifier ? name : "Voz " + nomeIdioma(voice.language);
}
function qualityLabel(quality: Speech.Voice["quality"]) {
  if (quality === Speech.VoiceQuality.Enhanced) return "Aprimorada";
  if (quality === Speech.VoiceQuality.Default) return "Padrão";
  return String(quality);
}

export default function LaboratorioVoz() {
  const { cores } = useTema();
  const [vozes, setVozes] = useState<Speech.Voice[]>([]);
  const [filtroIdioma, setFiltroIdioma] = useState<FiltroIdioma>("pt-br");
  const [buscaVoz, setBuscaVoz] = useState("");
  const [carregandoVozes, setCarregandoVozes] = useState(true);
  const [erroVozes, setErroVozes] = useState<string | null>(null);
  const [erroFala, setErroFala] = useState<string | null>(null);
  const [vozSelecionada, setVozSelecionada] = useState<string | null>(null);
  const [velocidade, setVelocidade] = useState(1);
  const [tom, setTom] = useState(1);
  const [frasePersonalizada, setFrasePersonalizada] = useState("");
  const [falando, setFalando] = useState(false);
  const falaAtual = useRef(0);

  const vozesOrdenadas = vozes
    .filter((voice) => correspondeFiltro(filtroIdioma, voice.language))
    .sort((a, b) => {
      const prioridadeA = categoriaIdioma(a.language) === "pt-br" ? 0 : 1;
      const prioridadeB = categoriaIdioma(b.language) === "pt-br" ? 0 : 1;
      return prioridadeA - prioridadeB || nomeExibido(a).localeCompare(nomeExibido(b));
    });
  const termoBusca = buscaVoz.trim().toLocaleLowerCase();
  const vozesVisiveis = vozesOrdenadas.filter((voice) =>
    (voice.name + " " + voice.identifier).toLocaleLowerCase().includes(termoBusca),
  );
  const temPtBr = vozes.some((voice) => categoriaIdioma(voice.language) === "pt-br");
  const vozAtual = vozes.find((voice) => voice.identifier === vozSelecionada);

  const trocarFiltroIdioma = (filtro: FiltroIdioma) => {
    setFiltroIdioma(filtro);
    if (vozSelecionada === null || (vozAtual && correspondeFiltro(filtro, vozAtual.language))) return;
    const primeiraVozCompativel = vozes
      .filter((voice) => correspondeFiltro(filtro, voice.language))
      .sort((a, b) => nomeExibido(a).localeCompare(nomeExibido(b)))[0];
    setVozSelecionada(primeiraVozCompativel?.identifier ?? null);
  };

  useEffect(() => {
    let montado = true;
    void Speech.getAvailableVoicesAsync()
      .then((available) => {
        if (montado) setVozes(available);
      })
      .catch(() => {
        if (montado) setErroVozes("Não foi possível consultar as vozes deste aparelho.");
      })
      .finally(() => {
        if (montado) setCarregandoVozes(false);
      });

    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        falaAtual.current += 1;
        setFalando(false);
        void Speech.stop().catch(() => {});
      }
    });

    return () => {
      montado = false;
      subscription.remove();
      falaAtual.current += 1;
      void Speech.stop().catch(() => {});
    };
  }, []);

  const parar = async () => {
    falaAtual.current += 1;
    setFalando(false);
    setErroFala(null);
    try {
      await Speech.stop();
    } catch {
      setErroFala("Não foi possível parar a fala.");
    }
  };

  const ouvir = async (text: string) => {
    const phrase = text.trim();
    if (!phrase) {
      setErroFala("Digite uma frase antes de ouvir.");
      return;
    }

    const request = ++falaAtual.current;
    setErroFala(null);
    setFalando(false);
    try {
      await Speech.stop();
      if (request !== falaAtual.current) return;
      Speech.speak(formatarCodigoLinhaParaFala(phrase), {
        ...(vozAtual ? { voice: vozAtual.identifier, language: vozAtual.language } : {}),
        rate: velocidade,
        pitch: tom,
        onStart: () => {
          if (request === falaAtual.current) setFalando(true);
        },
        onDone: () => {
          if (request === falaAtual.current) setFalando(false);
        },
        onStopped: () => {
          if (request === falaAtual.current) setFalando(false);
        },
        onError: () => {
          if (request === falaAtual.current) {
            setFalando(false);
            setErroFala("O motor de voz não conseguiu reproduzir esta frase.");
          }
        },
      });
    } catch {
      if (request === falaAtual.current) {
        setFalando(false);
        setErroFala("O motor de voz não conseguiu reproduzir esta frase.");
      }
    }
  };

  const botaoOpcao = (
    selecionado: boolean,
    titulo: string,
    onPress: () => void,
    key: string,
  ) => (
    <Pressable
      key={key}
      className="mr-2 mb-2 rounded-xl px-3 py-3"
      style={{
        backgroundColor: selecionado ? cores.fundoPrimario : cores.fundoPainel,
        borderColor: selecionado ? cores.fundoPrimario : cores.borda,
        borderWidth: 1,
      }}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: selecionado }}
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: selecionado ? cores.textoInverso : cores.textoPrimario }}
      >
        {titulo}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      className="flex-1"
      style={{ backgroundColor: cores.fundoApp }}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 130 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-5 flex-row items-center">
          <Pressable
            className="mr-3 h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: cores.fundoCard }}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar às configurações"
          >
            <ArrowLeft size={21} color={cores.iconePrimario} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-2xl font-bold" style={{ color: cores.textoPrimario }}>
              Laboratório de voz
            </Text>
            <Text className="mt-1 text-sm" style={{ color: cores.textoSecundario }}>
              Prévia manual com o motor de voz do aparelho
            </Text>
          </View>
        </View>

        <View
          className="rounded-2xl p-4"
          style={{ backgroundColor: cores.fundoCard, borderColor: cores.borda, borderWidth: 1 }}
        >
          <Text className="text-base font-semibold" style={{ color: cores.textoPrimario }}>
            Vozes disponíveis
          </Text>
          <Text className="mt-1 text-sm" style={{ color: cores.textoSecundario }}>
            A lista mostra somente vozes disponibilizadas pelo Android.
          </Text>

          <Text className="mt-4 text-sm font-medium" style={{ color: cores.textoSecundario }}>
            Idioma
          </Text>
          <View className="mt-2 flex-row flex-wrap">
            {filtrosIdioma.map((filtro) =>
              botaoOpcao(
                filtroIdioma === filtro.id,
                filtro.label,
                () => trocarFiltroIdioma(filtro.id),
                "idioma-" + filtro.id,
              ),
            )}
          </View>
          <TextInput
            className="mt-2 rounded-xl border px-3 py-3 text-sm"
            style={{ color: cores.textoPrimario, backgroundColor: cores.fundoInput, borderColor: cores.borda }}
            placeholder="Pesquisar nome ou identificador..."
            placeholderTextColor={cores.textoSecundario}
            value={buscaVoz}
            onChangeText={setBuscaVoz}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Pesquisar voz por nome ou identificador"
          />

          <Pressable
            className="mt-4 rounded-xl p-3"
            style={{
              backgroundColor: vozSelecionada === null ? cores.fundoSecundario : cores.fundoPainel,
              borderColor: vozSelecionada === null ? cores.fundoPrimario : cores.borda,
              borderWidth: 1,
            }}
            onPress={() => setVozSelecionada(null)}
            accessibilityRole="radio"
            accessibilityState={{ selected: vozSelecionada === null }}
          >
            <View className="flex-row items-center">
              <View className="flex-1">
                <Text className="text-sm font-semibold" style={{ color: cores.textoPrimario }}>
                  Padrão do sistema
                </Text>
                <Text className="mt-1 text-xs" style={{ color: cores.textoSecundario }}>
                  Usa a voz configurada como padrão no Android.
                </Text>
              </View>
              {vozSelecionada === null ? <Check size={18} color={cores.iconePrimario} /> : null}
            </View>
          </Pressable>

          {carregandoVozes ? (
            <ActivityIndicator className="mt-4" color={cores.iconePrimario} />
          ) : null}
          {erroVozes ? (
            <Text className="mt-3 text-sm" style={{ color: cores.perigo }}>
              {erroVozes}
            </Text>
          ) : null}
          {!carregandoVozes && !erroVozes && filtroIdioma === "pt-br" && !temPtBr ? (
            <Text className="mt-3 text-sm" style={{ color: cores.textoSecundario }}>
              Nenhuma voz pt-BR foi informada pelo aparelho. A lista mostra somente as vozes instaladas.
            </Text>
          ) : null}

          <View className="mt-3">
            {vozesVisiveis.map((voice) => {
              const selecionada = voice.identifier === vozSelecionada;
              return (
                <Pressable
                  key={voice.identifier}
                  className="mt-2 rounded-xl p-3"
                  style={{
                    backgroundColor: selecionada ? cores.fundoSecundario : cores.fundoPainel,
                    borderColor: selecionada ? cores.fundoPrimario : cores.borda,
                    borderWidth: 1,
                  }}
                  onPress={() => setVozSelecionada(voice.identifier)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selecionada }}
                >
                  <View className="flex-row items-center">
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-semibold" style={{ color: cores.textoPrimario }}>
                        {nomeExibido(voice)}
                      </Text>
                      <Text selectable className="mt-1 text-xs" style={{ color: cores.textoSecundario }}>
                        {voice.identifier}
                      </Text>
                      <Text className="mt-1 text-xs" style={{ color: cores.textoSecundario }}>
                        {nomeIdioma(voice.language)} · {qualityLabel(voice.quality)}
                      </Text>
                    </View>
                    {selecionada ? <Check size={18} color={cores.iconePrimario} /> : null}
                  </View>
                </Pressable>
              );
            })}
            {!carregandoVozes && !erroVozes && vozesVisiveis.length === 0 ? (
              <Text className="mt-3 text-sm" style={{ color: cores.textoSecundario }}>
                Nenhuma voz corresponde ao idioma e à pesquisa selecionados.
              </Text>
            ) : null}
          </View>
        </View>

        <View
          className="mt-4 rounded-2xl p-4"
          style={{ backgroundColor: cores.fundoCard, borderColor: cores.borda, borderWidth: 1 }}
        >
          <Text className="text-base font-semibold" style={{ color: cores.textoPrimario }}>
            Ajustes da prévia
          </Text>
          <Text className="mt-4 text-sm font-medium" style={{ color: cores.textoSecundario }}>
            Velocidade
          </Text>
          <View className="mt-2 flex-row flex-wrap">
            {velocidades.map((option) =>
              botaoOpcao(velocidade === option.value, option.label, () => setVelocidade(option.value), option.label),
            )}
          </View>
          <Text className="mt-2 text-sm font-medium" style={{ color: cores.textoSecundario }}>
            Tom
          </Text>
          <View className="mt-2 flex-row flex-wrap">
            {tons.map((option) =>
              botaoOpcao(tom === option.value, option.label, () => setTom(option.value), option.label),
            )}
          </View>
          <View className="mt-2 flex-row items-center">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-medium" style={{ color: cores.textoSecundario }}>
                Reprodução
              </Text>
              <Text className="mt-1 text-xs" style={{ color: cores.textoSecundario }}>
                {falando ? "Falando" : "Parada"}
              </Text>
            </View>
            <Pressable
              className="flex-row items-center rounded-xl px-3 py-3"
              style={{ backgroundColor: cores.fundoPainel, borderColor: cores.borda, borderWidth: 1 }}
              onPress={() => void parar()}
              accessibilityRole="button"
              accessibilityLabel="Parar fala"
            >
              <Square size={16} color={cores.textoPrimario} />
              <Text className="ml-2 text-sm font-semibold" style={{ color: cores.textoPrimario }}>
                Parar
              </Text>
            </Pressable>
          </View>
          {erroFala ? (
            <Text className="mt-3 text-sm" style={{ color: cores.perigo }}>
              {erroFala}
            </Text>
          ) : null}
        </View>

        <View
          className="mt-4 rounded-2xl p-4"
          style={{ backgroundColor: cores.fundoCard, borderColor: cores.borda, borderWidth: 1 }}
        >
          <Text className="text-base font-semibold" style={{ color: cores.textoPrimario }}>
            Frases de teste
          </Text>
          {frases.map((frase, index) => (
            <View
              key={frase}
              className="mt-3 flex-row items-center rounded-xl p-3"
              style={{ backgroundColor: cores.fundoPainel, borderColor: cores.borda, borderWidth: 1 }}
            >
              <View className="flex-1 pr-3">
                <Text className="text-xs font-semibold" style={{ color: cores.textoSecundario }}>
                  FRASE {index + 1}
                </Text>
                <Text className="mt-1 text-sm" style={{ color: cores.textoPrimario }}>
                  {frase}
                </Text>
              </View>
              <Pressable
                className="flex-row items-center rounded-xl px-3 py-2"
                style={{ backgroundColor: cores.fundoPrimario }}
                onPress={() => void ouvir(frase)}
                accessibilityRole="button"
                accessibilityLabel={"Ouvir frase " + (index + 1)}
              >
                <Play size={15} color={cores.textoInverso} />
                <Text className="ml-1 text-sm font-semibold" style={{ color: cores.textoInverso }}>
                  Ouvir
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View
          className="mt-4 rounded-2xl p-4"
          style={{ backgroundColor: cores.fundoCard, borderColor: cores.borda, borderWidth: 1 }}
        >
          <Text className="text-base font-semibold" style={{ color: cores.textoPrimario }}>
            Frase personalizada
          </Text>
          <TextInput
            className="mt-3 min-h-24 rounded-xl border p-3 text-base"
            style={{
              color: cores.textoPrimario,
              backgroundColor: cores.fundoInput,
              borderColor: cores.borda,
              textAlignVertical: "top",
            }}
            placeholder="Digite algo para testar a pronúncia..."
            placeholderTextColor={cores.textoSecundario}
            value={frasePersonalizada}
            onChangeText={setFrasePersonalizada}
            multiline
            maxLength={Speech.maxSpeechInputLength}
            accessibilityLabel="Frase personalizada para o teste de voz"
          />
          <Pressable
            className="mt-3 flex-row items-center justify-center rounded-xl px-4 py-3"
            style={{ backgroundColor: cores.fundoPrimario }}
            onPress={() => void ouvir(frasePersonalizada)}
            accessibilityRole="button"
            accessibilityLabel="Ouvir frase personalizada"
          >
            <Play size={16} color={cores.textoInverso} />
            <Text className="ml-2 text-sm font-semibold" style={{ color: cores.textoInverso }}>
              Ouvir
            </Text>
          </Pressable>
        </View>

        <Text className="mt-4 text-center text-xs" style={{ color: cores.textoSecundario }}>
          A prévia só toca quando você pressiona Ouvir. Ela para ao sair da tela ou ao minimizar o app.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
