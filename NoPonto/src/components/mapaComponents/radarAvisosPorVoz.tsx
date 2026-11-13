import TutorialTarget from "../tutorial/TutorialTarget";
import { useTutorial } from "../tutorial/TutorialProvider";
import * as Speech from "expo-speech";
import { Check, ChevronDown, Clock3, Headphones, Minus, Play, Plus, Square, Volume2, VolumeX } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useTema } from "@/src/hooks/useTema";
import {
  carregarPreferenciasVozRadar,
  autorizarRotaBluetoothVozRadar,
  consultarRotaSaidaVozRadar,
  consultarVozSilenciadaRadar,
  definirVozSilenciadaRadar,
  formatarCodigoLinhaParaFala,
  normalizarPreferenciasVozRadar,
  precisaConfirmarBluetoothRadar,
  PREFERENCIAS_VOZ_RADAR_PADRAO,
  resolverVozRadar,
  salvarPreferenciasVozRadar,
  type PreferenciasVozRadar,
  type PoliticaVeiculosRadar,
  type FrequenciaAvisosRadar,
  type RotaSaidaVozRadar,
  type TipoAnuncioRadar,
  type VozRadar,
} from "@/src/services/preferenciasVozRadar";

const OPCOES_VOZ: { id: VozRadar; nome: string; detalhe: string }[] = [
  { id: "lia", nome: "Lia", detalhe: "Suave e natural" },
  { id: "caio", nome: "Caio", detalhe: "Clara e direta" },
  { id: "device", nome: "Aparelho", detalhe: "Voz do sistema" },
];
const OPCOES_ANUNCIO: { id: TipoAnuncioRadar; nome: string; detalhe: string }[] = [
  { id: "brief", nome: "Breve", detalhe: "Recomendado · Linha + tempo" },
  { id: "standard", nome: "Padrão", detalhe: "Linha + tempo" },
  { id: "detailed", nome: "Detalhado", detalhe: "Rota completa" },
];
const OPCOES_VEICULOS: { id: PoliticaVeiculosRadar; nome: string; detalhe: string }[] = [
  { id: "nearest", nome: "Mais próximo", detalhe: "Apenas a próxima chegada" },
  { id: "nextAndFavorites", nome: "Próximo + favoritas", detalhe: "A próxima e a favorita mais próxima" },
  { id: "allRelevant", nome: "Todos relevantes", detalhe: "Até duas chegadas, com rotação justa" },
];
const OPCOES_FREQUENCIA: { id: FrequenciaAvisosRadar; nome: string; detalhe: string }[] = [
  { id: "essential", nome: "Essencial", detalhe: "Só mudanças importantes" },
  { id: "balanced", nome: "Equilibrado", detalhe: "Lembrete atual a cada 2 min" },
  { id: "eachUpdate", nome: "A cada atualização", detalhe: "Mais frequente · cerca de 30 s" },
];
const PRESETS_ANTECEDENCIA = [2, 5, 10, 15] as const;

function fraseExemplo(tipo: TipoAnuncioRadar) {
  if (tipo === "brief") return "Linha 838 em três minutos.";
  if (tipo === "detailed") return "Atenção. A linha 838 está prevista para chegar à parada em três minutos. Prepare-se para o embarque.";
  return "A linha 838 está prevista para chegar à parada em três minutos.";
}

export default function RadarAvisosPorVoz({ tutorialScrollRef }: { tutorialScrollRef?: React.RefObject<ScrollView | null> } = {}) {
  const tutorial = useTutorial();
  const tutorialVoice = tutorial.chapter === 5 && Boolean(tutorial.step?.startsWith("voice"));
  const previewOwned = useRef(false);
  const previousConfirmation = useRef(false);
  const tutorialWasActive = useRef(false);
  const { cores } = useTema();
  const [preferencias, setPreferencias] = useState<PreferenciasVozRadar>(PREFERENCIAS_VOZ_RADAR_PADRAO);
  const [preferenciasCarregadas, setPreferenciasCarregadas] = useState(false);
  const [expandida, setExpandida] = useState(false);
  const [vozes, setVozes] = useState<Speech.Voice[]>([]);
  const [vozesCarregadas, setVozesCarregadas] = useState(false);
  const [falando, setFalando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [estadoSalvamento, setEstadoSalvamento] = useState("");
  const [confirmarAltoFalante, setConfirmarAltoFalante] = useState(false);
  const [vozSilenciada, setVozSilenciada] = useState(false);
  const [rotaSaidaVoz, setRotaSaidaVoz] = useState<RotaSaidaVozRadar | null>(null);
  const [autorizandoRotaBluetooth, setAutorizandoRotaBluetooth] = useState(false);
  const [erroRotaBluetooth, setErroRotaBluetooth] = useState("");
  const montado = useRef(false);
  const falaAtual = useRef(0);
  const filaSalvamento = useRef(Promise.resolve());

  const resolucao = resolverVozRadar(vozes, preferencias.voiceId);
  const vozLabel = OPCOES_VOZ.find((option) => option.id === preferencias.voiceId)?.nome ?? "Voz";
  const tipoLabel = OPCOES_ANUNCIO.find((option) => option.id === preferencias.announcementStyle)?.nome ?? "Padrão";
  const textoResolucao = preferencias.voiceId === "device"
    ? "Voz padrão do aparelho; português brasileiro quando disponível."
    : resolucao.origem === "familia" && resolucao.voice
      ? `${vozLabel} está disponível e pronta neste aparelho${vozLocal(resolucao.voice) ? " (sem consumo de dados)" : ""}.`
      : resolucao.origem === "fallback-pt-br" && resolucao.voice
        ? `${vozLabel} não está disponível; será usada outra voz em português.`
        : "Não há voz em português brasileiro instalada; será usada a voz padrão.";

  const nomeRota = rotaSaidaVoz?.deviceName?.trim();
  const rotaBluetooth = rotaSaidaVoz?.routeType.includes("bluetooth") ?? false;
  const rotaUsb = rotaSaidaVoz?.routeType.includes("usb") ?? false;
  const rotaComFone = !!rotaSaidaVoz && (rotaSaidaVoz.automaticHeadphone || rotaSaidaVoz.authorized || rotaSaidaVoz.requiresConfirmation);
  const tipoRota = rotaBluetooth ? "Bluetooth" : rotaUsb ? "USB" : "Com fio";
  const estadoRota = !rotaComFone ? "Sem saída de fones" : precisaConfirmarBluetoothRadar(rotaSaidaVoz)
    ? "Precisa confirmar" : "Pronto";
  const resumo = preferencias.enabled
    ? [vozLabel, tipoLabel, `${preferencias.advanceMinutes} min`, preferencias.headphonesOnly
      ? rotaComFone && !precisaConfirmarBluetoothRadar(rotaSaidaVoz) ? "Fone conectado" : "Somente com fones"
      : "Alto-falante", vozSilenciada ? "Silenciada" : null].filter(Boolean).join(" · ")
    : "Desativado";

  useEffect(() => {
    montado.current = true;
    const atualizarSilencio = () => {
      void consultarVozSilenciadaRadar().then((muted) => {
        if (montado.current) setVozSilenciada(muted);
      });
    };
    atualizarSilencio();
    void carregarPreferenciasVozRadar()
      .then((saved) => {
        if (!montado.current) return;
        const normalized = normalizarPreferenciasVozRadar(saved);
        setPreferencias(normalized);
        setPreferenciasCarregadas(true);
        if (tutorial.chapter !== 5) filaSalvamento.current = filaSalvamento.current
          .catch(() => {})
          .then(() => salvarPreferenciasVozRadar(normalized))
          .then((nativeSaved) => {
            if (montado.current && !nativeSaved) setEstadoSalvamento("Preferências salvas no app; espelhamento nativo indisponível neste APK.");
          })
          .catch(() => {
            if (montado.current) setEstadoSalvamento("Não foi possível salvar as preferências.");
          });
      })
      .catch(() => {
        if (!montado.current) return;
        setPreferencias({ ...PREFERENCIAS_VOZ_RADAR_PADRAO });
        setPreferenciasCarregadas(true);
        setEstadoSalvamento("Não foi possível ler as preferências salvas.");
      });
    void Speech.getAvailableVoicesAsync()
      .then((available) => {
        if (montado.current) setVozes(available);
      })
      .catch(() => {
        if (montado.current) setErro("Não foi possível consultar as vozes instaladas. A prévia usará a voz padrão.");
      })
      .finally(() => {
        if (montado.current) setVozesCarregadas(true);
      });
    const appState = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        falaAtual.current += 1;
        setFalando(false);
        if (previewOwned.current) { previewOwned.current = false; void Speech.stop().catch(() => {}); }
      } else {
        atualizarSilencio();
      }
    });
    return () => {
      appState.remove();
      montado.current = false;
      falaAtual.current += 1;
      if (previewOwned.current) { previewOwned.current = false; void Speech.stop().catch(() => {}); }
    };
  }, []);

  useEffect(() => {
    if (!expandida || !preferenciasCarregadas || !preferencias.headphonesOnly) {
      setRotaSaidaVoz(null);
      setErroRotaBluetooth("");
      return;
    }
    let active = true;
    const refreshRoute = () => {
      void consultarRotaSaidaVozRadar().then((route) => {
        if (active) setRotaSaidaVoz(route);
      });
    };
    refreshRoute();
    const timer = setInterval(refreshRoute, 2000);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") refreshRoute();
    });
    return () => {
      active = false;
      clearInterval(timer);
      appState.remove();
    };
  }, [expandida, preferenciasCarregadas, preferencias.headphonesOnly]);

  const salvar = (patch: Partial<PreferenciasVozRadar>) => {
    const next = normalizarPreferenciasVozRadar({ ...preferencias, ...patch });
    setPreferencias(next);
    setEstadoSalvamento("Salvando…");
    filaSalvamento.current = filaSalvamento.current
      .catch(() => {})
      .then(() => salvarPreferenciasVozRadar(next))
      .then((nativeSaved) => {
        if (montado.current) setEstadoSalvamento(nativeSaved
          ? "Preferências salvas neste aparelho."
          : "Preferências salvas no app; atualize o APK para sincronizar o armazenamento nativo.");
      })
      .catch(() => {
        if (montado.current) setEstadoSalvamento("Não foi possível salvar as preferências.");
      });
  };

  useEffect(() => {
    if (tutorialVoice) setExpandida(true);
    if (tutorialWasActive.current && !tutorial.step) {
      falaAtual.current += 1;
      if (previewOwned.current) {
        previewOwned.current = false;
        setFalando(false);
        void Speech.stop().catch(() => {});
      }
    }
    tutorialWasActive.current = Boolean(tutorial.step);
  }, [tutorialVoice, tutorial.step]);
  useEffect(() => {
    if (tutorial.chapter === 5 && (confirmarAltoFalante || previousConfirmation.current)) tutorial.setRadarHost(confirmarAltoFalante ? "confirmation" : "radar");
    previousConfirmation.current = confirmarAltoFalante;
  }, [confirmarAltoFalante]);

  const ouvir = async () => {
    const request = ++falaAtual.current;
    setErro(null);
    setFalando(false);
    try {
      if (preferencias.headphonesOnly) {
        const route = await consultarRotaSaidaVozRadar();
        if (request !== falaAtual.current) return;
        setRotaSaidaVoz(route);
        if (!route || (!route.automaticHeadphone && !route.authorized) || precisaConfirmarBluetoothRadar(route)) {
          setErro("Conecte ou confirme seus fones para ouvir o exemplo.");
          return;
        }
      }
      previewOwned.current = true;
      await Speech.stop();
      if (request !== falaAtual.current) return;
      const voice = resolucao.voice;
      Speech.speak(formatarCodigoLinhaParaFala(fraseExemplo(preferencias.announcementStyle)), {
        ...(voice ? { voice: voice.identifier, language: voice.language } : preferencias.voiceId === "device" ? { language: "pt-BR" } : {}),
        rate: 1,
        pitch: 1,
        onStart: () => { if (request === falaAtual.current) setFalando(true); },
        onDone: () => { if (request === falaAtual.current) { previewOwned.current = false; setFalando(false); } },
        onStopped: () => { if (request === falaAtual.current) { previewOwned.current = false; setFalando(false); } },
        onError: () => {
          if (request === falaAtual.current) {
            previewOwned.current = false;
            setFalando(false);
            setErro("O motor de voz não conseguiu reproduzir o exemplo.");
          }
        },
      });
    } catch {
      if (request === falaAtual.current) {
        setFalando(false);
        setErro("O motor de voz não conseguiu reproduzir o exemplo.");
      }
    }
  };

  const parar = async () => {
    previewOwned.current = false;
    falaAtual.current += 1;
    setFalando(false);
    try {
      await Speech.stop();
    } catch {
      setErro("Não foi possível parar a prévia.");
    }
  };

  const reativarVoz = async () => {
    const saved = await definirVozSilenciadaRadar(false);
    if (!montado.current) return;
    if (saved) {
      setVozSilenciada(false);
      setEstadoSalvamento("Voz reativada para os próximos avisos.");
    } else {
      setEstadoSalvamento("Não foi possível reativar a voz neste APK.");
    }
  };

  const autorizarSaidaBluetoothAtual = async () => {
    setAutorizandoRotaBluetooth(true);
    setErroRotaBluetooth("");
    try {
      const authorized = await autorizarRotaBluetoothVozRadar();
      const route = await consultarRotaSaidaVozRadar();
      if (!montado.current) return;
      setRotaSaidaVoz(route);
      if (!authorized) setErroRotaBluetooth("A saída mudou ou não é um A2DP compatível. Confirme novamente com a rota desejada conectada.");
    } finally {
      if (montado.current) setAutorizandoRotaBluetooth(false);
    }
  };

  const atualizarSilencioDaVoz = () => {
    void consultarVozSilenciadaRadar().then((muted) => {
      if (montado.current) setVozSilenciada(muted);
    });
  };

  const chip = (selected: boolean, label: string, onPress: () => void, key: string, checkbox = false) => (
    <Pressable key={key}
      accessibilityRole={checkbox ? "checkbox" : "radio"}
      accessibilityState={checkbox
        ? { checked: selected, disabled: !preferenciasCarregadas }
        : { selected, disabled: !preferenciasCarregadas }}
      disabled={!preferenciasCarregadas}
      onPress={onPress}
      style={{ flex: 1, minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
        borderWidth: 1, borderColor: selected ? cores.fundoPrimario : cores.borda,
        borderRadius: 12, paddingHorizontal: 4, backgroundColor: selected ? cores.fundoSecundario : cores.fundoPainel,
        opacity: preferenciasCarregadas ? 1 : 0.5 }}>
      {selected ? <Check size={14} color={cores.iconePrimario} /> : null}
      <Text style={{ color: cores.textoPrimario, fontSize: 11, fontWeight: "600", textAlign: "center", flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ padding: 15, borderRadius: 18, backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, gap: 12 }}>
      <TutorialTarget kind="radar" enabled={tutorial.step === "voiceIntro" || tutorial.step === "voiceMute"} reveal clipRef={tutorialScrollRef} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expandida ? "Recolher avisos por voz" : "Expandir avisos por voz"}
          accessibilityHint="Mostra ou oculta as opções de voz do Radar"
          onPress={() => setExpandida(!expandida)}
          style={{ flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,193,7,0.2)" }}>
            <Volume2 size={19} color="#FFC107" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: cores.textoPrimario, fontWeight: "700" }}>Avisos por voz</Text>
            <Text numberOfLines={1} style={{ color: cores.textoSecundario, fontSize: 12, marginTop: 2 }}>{resumo}</Text>
          </View>
          <ChevronDown size={17} color={cores.iconeSecundario} style={{ transform: [{ rotate: expandida ? "180deg" : "0deg" }] }} />
        </Pressable>
        <TutorialTarget kind="radar" enabled={tutorial.step === "voiceEnable"} reveal clipRef={tutorialScrollRef} style={{ alignItems: "center" }}>
          <Switch
            value={preferencias.enabled}
            disabled={!preferenciasCarregadas}
            onValueChange={(enabled) => {
              salvar({ enabled });
              if (enabled) {
                setExpandida(true);
                setVozSilenciada(false);
                void definirVozSilenciadaRadar(false).then((saved) => {
                  if (montado.current && !saved) atualizarSilencioDaVoz();
                });
              }
            }}
            accessibilityLabel="Ativar narração"
          />
        </TutorialTarget>
      </TutorialTarget>

      {expandida ? (
        <View style={{ gap: 13 }}>
          {preferencias.enabled ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10,
            borderRadius: 12, backgroundColor: cores.fundoPainel }}>
            <Headphones size={15} color={cores.iconePrimario} />
            <Text style={{ flex: 1, color: cores.textoSecundario, fontSize: 11 }}>
              {preferencias.headphonesOnly
                ? rotaComFone && !precisaConfirmarBluetoothRadar(rotaSaidaVoz)
                  ? "Os avisos tocam nos fones sem precisar tirar o celular do bolso."
                  : "Conecte fones para ouvir os avisos com discrição."
                : "Os avisos podem tocar no alto-falante do aparelho."}
            </Text>
          </View> : null}

          {preferencias.enabled && vozSilenciada ? (
            <View style={{ minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8,
              paddingHorizontal: 11, borderRadius: 12, backgroundColor: cores.fundoPainel }}>
              <VolumeX size={17} color={cores.iconePrimario} />
              <Text style={{ flex: 1, color: cores.textoSecundario, fontSize: 12 }}>Voz silenciada pela notificação.</Text>
              <Pressable accessibilityRole="button" onPress={() => void reativarVoz()}>
                <Text style={{ color: cores.iconePrimario, fontSize: 12, fontWeight: "700" }}>Ativar voz</Text>
              </Pressable>
            </View>
          ) : null}

          {!preferenciasCarregadas ? <ActivityIndicator color={cores.iconePrimario} /> : null}

          <TutorialTarget kind="radar" enabled={tutorial.step === "voiceChoice"} reveal clipRef={tutorialScrollRef} style={{ gap: 7 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Text style={{ flex: 1, color: cores.textoPrimario, fontWeight: "700" }}>Voz do assistente</Text>
              <Text style={{ color: cores.iconePrimario, fontSize: 11, fontWeight: "600" }}>Português (BR)</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {OPCOES_VOZ.map((voice) => {
                const selected = preferencias.voiceId === voice.id;
                return <Pressable key={voice.id} accessibilityRole="radio" accessibilityState={{ selected, disabled: !preferenciasCarregadas }}
                  disabled={!preferenciasCarregadas} onPress={() => salvar({ voiceId: voice.id })}
                  style={{ flex: 1, minHeight: 54, justifyContent: "center", alignItems: "center", gap: 3, paddingHorizontal: 3,
                    borderRadius: 13, backgroundColor: selected ? cores.fundoPrimario : cores.fundoPainel,
                    borderWidth: 1, borderColor: selected ? cores.fundoPrimario : cores.borda, opacity: preferenciasCarregadas ? 1 : 0.5 }}>
                  <Text style={{ color: selected ? cores.textoSobrePrimario : cores.textoPrimario, fontSize: 12, fontWeight: "700" }}>{voice.nome}</Text>
                  <Text style={{ color: selected ? cores.textoSobrePrimario : cores.textoSecundario, fontSize: 9, textAlign: "center" }}>{voice.detalhe}</Text>
                </Pressable>;
              })}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: resolucao.voice ? cores.sucesso : cores.iconeSecundario }} />
              <Text style={{ flex: 1, color: cores.textoSecundario, fontSize: 11 }}>{textoResolucao}</Text>
            </View>
          </TutorialTarget>

          <TutorialTarget kind="radar" enabled={tutorial.step === "voiceOptions"} reveal clipRef={tutorialScrollRef} style={{ gap: 7 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Clock3 size={16} color={cores.iconePrimario} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: cores.textoPrimario, fontWeight: "700" }}>Quando a voz começa</Text>
                <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>Escolha com quanto tempo de antecedência o assistente começa a avisar.</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
              minHeight: 58, borderRadius: 14, backgroundColor: cores.fundoPainel }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Diminuir antecedência" disabled={preferencias.advanceMinutes <= 1}
                onPress={() => salvar({ advanceMinutes: Math.max(1, preferencias.advanceMinutes - 1) })}
                style={{ width: 44, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12,
                  backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, opacity: preferencias.advanceMinutes <= 1 ? 0.4 : 1 }}>
                <Minus size={17} color={cores.textoPrimario} />
              </Pressable>
              <Text accessibilityLiveRegion="polite" style={{ minWidth: 112, textAlign: "center", color: cores.textoPrimario, fontWeight: "700", fontSize: 15 }}>
                {preferencias.advanceMinutes} {preferencias.advanceMinutes === 1 ? "minuto" : "minutos"}{"\n"}
                <Text style={{ color: cores.textoSecundario, fontSize: 10, fontWeight: "400" }}>Janela do radar</Text>
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Aumentar antecedência" disabled={preferencias.advanceMinutes >= 15}
                onPress={() => salvar({ advanceMinutes: Math.min(15, preferencias.advanceMinutes + 1) })}
                style={{ width: 44, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 12,
                  backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda, opacity: preferencias.advanceMinutes >= 15 ? 0.4 : 1 }}>
                <Plus size={17} color={cores.textoPrimario} />
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {PRESETS_ANTECEDENCIA.map((minute) => chip(preferencias.advanceMinutes === minute,
                `${minute} min`, () => salvar({ advanceMinutes: minute }), `advance-${minute}`))}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: cores.fundoPainel }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: cores.textoPrimario, fontSize: 12, fontWeight: "600" }}>Avisar quando estiver chegando</Text>
                <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>Um aviso extra quando faltar menos de 1 minuto.</Text>
              </View>
              <Switch value={preferencias.announceArriving} disabled={!preferenciasCarregadas}
                onValueChange={(announceArriving) => salvar({ announceArriving })}
                accessibilityLabel="Avisar quando estiver chegando" />
            </View>
          </TutorialTarget>

          <View style={{ gap: 8 }}>
            <Text style={{ color: cores.textoPrimario, fontWeight: "700" }}>Quais veículos anunciar</Text>
            <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>Escolha quais chegadas destacar no canal de voz.</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {OPCOES_VEICULOS.map((option) => chip(preferencias.vehicleSelection === option.id,
                option.id === "nextAndFavorites" ? "Próximo + fav." : option.nome,
                () => salvar({ vehicleSelection: option.id }), `vehicles-${option.id}`))}
            </View>
            <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>
              {OPCOES_VEICULOS.find((option) => option.id === preferencias.vehicleSelection)?.detalhe}
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: cores.textoPrimario, fontWeight: "700" }}>Frequência dos avisos</Text>
            <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>Defina com que frequência o assistente atualiza você.</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {OPCOES_FREQUENCIA.map((option) => chip(preferencias.announcementFrequency === option.id,
                option.nome, () => salvar({ announcementFrequency: option.id }), `frequency-${option.id}`))}
            </View>
            <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>
              {OPCOES_FREQUENCIA.find((option) => option.id === preferencias.announcementFrequency)?.detalhe}
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: cores.textoPrimario, fontWeight: "700" }}>Tipo de anúncio</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {OPCOES_ANUNCIO.map((option) => {
                const selected = preferencias.announcementStyle === option.id;
                return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected, disabled: !preferenciasCarregadas }}
                  disabled={!preferenciasCarregadas} onPress={() => salvar({ announcementStyle: option.id })}
                  style={{ flex: 1, minHeight: 54, justifyContent: "center", alignItems: "center", gap: 3, paddingHorizontal: 3,
                    borderRadius: 13, backgroundColor: selected ? cores.fundoPrimario : cores.fundoPainel,
                    borderWidth: 1, borderColor: selected ? cores.fundoPrimario : cores.borda, opacity: preferenciasCarregadas ? 1 : 0.5 }}>
                  <Text style={{ color: selected ? cores.textoSobrePrimario : cores.textoPrimario, fontSize: 11, fontWeight: "700", textAlign: "center" }}>{option.nome}</Text>
                  <Text style={{ color: selected ? cores.textoSobrePrimario : cores.textoSecundario, fontSize: 8, textAlign: "center" }}>{option.detalhe}</Text>
                </Pressable>;
              })}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, backgroundColor: cores.fundoPainel }}>
              <Volume2 size={16} color={cores.iconePrimario} />
              <Text style={{ flex: 1, color: cores.textoSecundario, fontSize: 11 }}>
                Exemplo de locução {vozLabel}: “{formatarCodigoLinhaParaFala(fraseExemplo(preferencias.announcementStyle))}”
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 }}>
              <Volume2 size={17} color={cores.iconePrimario} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: cores.textoPrimario, fontSize: 12, fontWeight: "600" }}>Som antes de falar</Text>
                <Text style={{ color: cores.textoSecundario, fontSize: 10 }}>Um toque suave antes de cada aviso de voz.</Text>
              </View>
              <Switch value={preferencias.soundBeforeSpeech} disabled={!preferenciasCarregadas}
                onValueChange={(soundBeforeSpeech) => salvar({ soundBeforeSpeech })}
                accessibilityLabel="Som antes de falar" />
            </View>
          </View>

          <TutorialTarget kind="radar" enabled={tutorial.step === "voiceHeadphones"} reveal clipRef={tutorialScrollRef} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: cores.textoPrimario, fontWeight: "700" }}>Somente com fones</Text>
              <Text style={{ color: cores.textoSecundario, fontSize: 11, marginTop: 2 }}>A prévia só toca em uma saída reconhecida ou autorizada.</Text>
            </View>
            <Switch
              value={preferencias.headphonesOnly}
              disabled={!preferenciasCarregadas}
              onValueChange={(headphonesOnly) => {
                if (headphonesOnly) {
                  salvar({ headphonesOnly: true });
                  return;
                }
                setConfirmarAltoFalante(true);
              }}
              accessibilityLabel="Somente com fones"
            />
          </TutorialTarget>

          {preferencias.headphonesOnly ? <View style={{ minHeight: 54, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 10,
            borderRadius: 12, backgroundColor: cores.fundoPainel }}>
            <Headphones size={18} color={rotaComFone && !precisaConfirmarBluetoothRadar(rotaSaidaVoz) ? cores.iconePrimario : cores.iconeSecundario} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: cores.textoPrimario, fontSize: 12, fontWeight: "600" }}>
                {rotaComFone ? nomeRota || (rotaBluetooth ? "Saída Bluetooth" : rotaUsb ? "Saída USB" : "Fone com fio") : "Nenhum fone conectado"}
              </Text>
              <Text style={{ color: cores.textoSecundario, fontSize: 10 }}>
                {rotaComFone ? `${tipoRota} conectado · Áudio ${estadoRota.toLowerCase()}` : estadoRota}
              </Text>
            </View>
            {precisaConfirmarBluetoothRadar(rotaSaidaVoz) ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Confirmar meus fones"
                disabled={autorizandoRotaBluetooth}
                onPress={() => void autorizarSaidaBluetoothAtual()}
                style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8, opacity: autorizandoRotaBluetooth ? 0.6 : 1 }}>
                <Text style={{ color: cores.iconePrimario, fontSize: 11, fontWeight: "700" }}>
                  {autorizandoRotaBluetooth ? "Confirmando…" : "Confirmar meus fones"}
                </Text>
              </Pressable>
            ) : null}
          </View> : null}
          {preferencias.headphonesOnly && precisaConfirmarBluetoothRadar(rotaSaidaVoz) ? (
            <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>
              O Android não identificou se esta saída é um fone. Confirme apenas se estiver usando fones, não uma caixa de som.
            </Text>
          ) : null}
          {preferencias.headphonesOnly && erroRotaBluetooth ? <Text style={{ color: cores.textoSecundario, fontSize: 11 }}>{erroRotaBluetooth}</Text> : null}

          <TutorialTarget kind="radar" enabled={tutorial.step === "voicePreview"} reveal clipRef={tutorialScrollRef} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Ouvir exemplo de voz"
              disabled={!preferenciasCarregadas || !vozesCarregadas}
              onPress={() => void ouvir()}
              style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center",
                gap: 7, paddingHorizontal: 14, borderRadius: 12, backgroundColor: cores.fundoPrimario,
                opacity: preferenciasCarregadas && vozesCarregadas ? 1 : 0.5 }}>
              <Play size={16} color={cores.textoSobrePrimario} />
              <Text style={{ color: cores.textoSobrePrimario, fontWeight: "700" }}>Ouvir exemplo com voz de {vozLabel}</Text>
            </Pressable>
            {falando ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Parar exemplo" onPress={() => void parar()}
                style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12 }}>
                <Square size={15} color={cores.textoPrimario} />
                <Text style={{ color: cores.textoPrimario }}>Parar</Text>
              </Pressable>
            ) : null}
          </TutorialTarget>

          {erro ? <Text style={{ color: cores.perigo, fontSize: 11 }}>{erro}</Text> : null}
          {estadoSalvamento ? (
            <Text accessibilityLiveRegion="polite" style={{ color: cores.textoSecundario, fontSize: 11 }}>
              {estadoSalvamento}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Modal
        visible={confirmarAltoFalante}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setConfirmarAltoFalante(false)}>
        <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.72)" }}>
          <Pressable
            onPress={() => setConfirmarAltoFalante(false)}
            style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
            accessibilityLabel="Fechar confirmação" />
          <Pressable onPress={() => {}} style={{ width: "100%", maxWidth: 420, alignSelf: "center", padding: 22, gap: 14,
            borderRadius: 24, backgroundColor: cores.fundoCard, borderWidth: 1, borderColor: cores.borda }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center",
              backgroundColor: "rgba(255,193,7,0.16)" }}>
              <Volume2 size={23} color="#FFC107" />
            </View>
            <View style={{ gap: 7 }}>
              <Text style={{ color: cores.textoPrimario, fontSize: 19, fontWeight: "800" }}>Usar o alto-falante?</Text>
              <Text style={{ color: cores.textoSecundario, fontSize: 14, lineHeight: 21 }}>
                Os avisos podem incomodar outras pessoas em ônibus, trens e estações. Sempre que possível, prefira utilizar fones de ouvido.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmarAltoFalante(false)}
              style={{ minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center",
                paddingHorizontal: 14, backgroundColor: "#FFC107" }}>
              <Text style={{ color: "#191919", fontWeight: "800", textAlign: "center" }}>Manter somente com fones</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setConfirmarAltoFalante(false);
                salvar({ headphonesOnly: false });
              }}
              style={{ minHeight: 46, borderRadius: 14, alignItems: "center", justifyContent: "center",
                paddingHorizontal: 14, borderWidth: 1, borderColor: cores.borda }}>
              <Text style={{ color: cores.textoPrimario, fontWeight: "700", textAlign: "center" }}>Permitir alto-falante</Text>
            </Pressable>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function vozLocal(voice: Speech.Voice) {
  const metadata = voice as Speech.Voice & { localService?: boolean; networkConnectionRequired?: boolean };
  if (typeof metadata.localService === "boolean") return metadata.localService;
  if (typeof metadata.networkConnectionRequired === "boolean") return !metadata.networkConnectionRequired;
  return /(?:^|[-_.])local(?:$|[-_.])/.test((voice.identifier + " " + voice.name).toLowerCase());
}
