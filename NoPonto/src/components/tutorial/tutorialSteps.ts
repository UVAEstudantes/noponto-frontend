export type Step =
  | "welcome"
  | "invite"
  | "search"
  | "route"
  | "done"
  | "vehiclesIntro"
  | "vehicle"
  | "vehicleDetails"
  | "noVehicles"
  | "vehicleDemo"
  | "vehiclesDone"
  | "stopsIntro"
  | "stop"
  | "stopDetails"
  | "noStops"
  | "stopDemo"
  | "stations"
  | "stopsDone"
  | "linesIntro"
  | "lineControls"
  | "lineDirection"
  | "lineColor"
  | "lineFavorite"
  | "lineVisibility"
  | "lineRemove"
  | "lineTab"
  | "linesDone"
  | "radarIntro"
  | "radarStop"
  | "radarLines"
  | "radarStart"
  | "radarDone"
  | "notificationIntro"
  | "notificationTiming"
  | "notificationLines"
  | "notificationPreview"
  | "notificationBackground"
  | "notificationsDone"
  | "voiceIntro"
  | "voiceEnable"
  | "voiceChoice"
  | "voicePreview"
  | "voiceOptions"
  | "voiceHeadphones"
  | "voiceMute"
  | "voiceSave"
  | "radarChapterDone"
  | "transportIntro"
  | "transportFilters"
  | "transportBrt"
  | "transportRail"
  | "railStatus"
  | "transportMap"
  | "journeyDone"
  | null;
export type Progress = {
  seen: boolean;
  completed: boolean;
  dismissed: boolean;
  chapters?: number[];
  radarSections?: string[];
  radarResume?: Step;
  journeyFinished?: boolean;
  presentationFinished?: boolean;
  skippedSteps?: string[];
  manualReplays?: number;
};
export const KEY = "@onboarding:v1";
export const EMPTY: Progress = {
  seen: false,
  completed: false,
  dismissed: false,
};
export async function readProgress(storage: {
  getItem(key: string): Promise<string | null>;
}): Promise<Progress> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      storage.getItem(KEY),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 2000);
      }),
    ]);
    const v = JSON.parse(raw ?? "null");
    return {
      ...(Array.isArray(v?.radarSections) ? { radarSections: ["5A", "5B", "5C"].filter(id => v.radarSections.includes(id)) } : {}),
      ...(RADAR_STEPS.includes(v?.radarResume) ? { radarResume: v.radarResume } : {}),
      ...(v?.journeyFinished === true ? {journeyFinished: true} : {}),
      ...(v?.presentationFinished === true ? {presentationFinished: true} : {}),
      ...(Array.isArray(v?.skippedSteps) ? {skippedSteps: v.skippedSteps.filter((value: unknown) => typeof value === "string")} : {}),
      ...(Number.isSafeInteger(v?.manualReplays) && v.manualReplays > 0 ? {manualReplays: v.manualReplays} : {}),
      seen: v?.seen === true,
      completed: v?.completed === true,
      dismissed: v?.dismissed === true,
      ...(v?.completed === true || Array.isArray(v?.chapters)
        ? {
            chapters: [1, 2, 3, 4, 5, 6].filter(
              (id) =>
                (id === 1 && v?.completed === true) || v.chapters?.includes(id),
            ),
          }
        : {}),
    };
  } catch {
    return { ...EMPTY };
  } finally {
    clearTimeout(timer);
  }
}
export function transition(
  step: Step,
  event:
    | "next"
    | "back"
    | "selected"
    | "skip"
    | "vehicleSelected"
    | "stopSelected"
    | "unavailable"
    | "demo",
): Step {
  if (event === "selected") return step === "search" ? "route" : step;
  if (event === "vehicleSelected")
    return step === "vehicle" ? "vehicleDetails" : step;
  if (event === "stopSelected") return step === "stop" ? "stopDetails" : step;
  if (event === "unavailable")
    return step === "stop" || step === "stopDetails"
      ? "noStops"
      : step === "vehicle" || step === "vehicleDetails"
        ? "noVehicles"
        : step;
  if (event === "demo")
    return step === "noStops"
      ? "stopDemo"
      : step === "noVehicles"
        ? "vehicleDemo"
        : step;
  if (chapterOf(step) === 6) {
    const order: Step[] = ["transportIntro", "transportFilters", "transportBrt", "transportRail", "railStatus", "transportMap", "journeyDone"];
    const index = order.indexOf(step);
    return event === "back" ? order[index - 1] ?? "radarChapterDone" : order[index + 1] ?? null;
  }
  if (step === "radarChapterDone" && event !== "back") return "transportIntro";
  if (chapterOf(step) === 5) {
    const index = RADAR_STEPS.indexOf(step!);
    return event === "back" ? (RADAR_STEPS[index - 1] ?? "linesDone") : (RADAR_STEPS[index + 1] ?? null);
  }
  if (step === "linesDone" && event !== "back") return "radarIntro";
  if (chapterOf(step) === 4) {
    const order: Step[] = [
      "linesIntro",
      "lineControls",
      "lineDirection",
      "lineColor",
      "lineFavorite",
      "lineVisibility",
      "lineRemove",
      "lineTab",
      "linesDone",
    ];
    const index = order.indexOf(step);
    return event === "back"
      ? (order[index - 1] ?? "stopsDone")
      : (order[index + 1] ?? null);
  }
  if (event === "back" && chapterOf(step) === 3)
    return (
      (
        {
          stopsIntro: "vehiclesDone",
          stop: "stopsIntro",
          stopDetails: "stop",
          noStops: "stopsIntro",
          stopDemo: "noStops",
          stations: "stopsIntro",
          stopsDone: "stations",
        } as Partial<Record<NonNullable<Step>, Step>>
      )[step!] ?? step
    );
  if (step === "vehiclesDone" && event !== "back") return "stopsIntro";
  if (step === "stopsIntro" && event !== "back")
    return event === "skip" ? "stations" : "stop";
  if (step === "stop" && event !== "back")
    return event === "skip" ? "stations" : step;
  if (
    ["stopDetails", "stopDemo", "noStops"].includes(step ?? "") &&
    event !== "back"
  )
    return "stations";
  if (step === "stations" && event !== "back") return "stopsDone";
  if (step === "stopsDone" && event !== "back") return "linesIntro";
  if (event === "back" && step && step.startsWith("vehicle"))
    return (
      (
        {
          vehiclesIntro: "done",
          vehicle: "vehiclesIntro",
          vehicleDetails: "vehicle",
          vehicleDemo: "noVehicles",
          vehiclesDone: "vehiclesIntro",
        } as Partial<Record<NonNullable<Step>, Step>>
      )[step] ?? step
    );
  if (event === "back" && step === "noVehicles") return "vehiclesIntro";
  if (event === "back")
    return step === "search"
      ? "invite"
      : step === "invite"
        ? "welcome"
        : step === "route"
          ? "search"
          : step === "done"
            ? "route"
            : step;
  if (step === "welcome") return "invite";
  if (step === "invite") return "search";
  if (step === "search") return event === "skip" ? "route" : step;
  if (step === "route") return "done";
  if (step === "done") return "vehiclesIntro";
  if (step === "vehiclesIntro")
    return event === "skip" ? "vehiclesDone" : "vehicle";
  if (step === "vehicle") return event === "skip" ? "vehiclesDone" : step;
  if (
    step === "vehicleDetails" ||
    step === "vehicleDemo" ||
    step === "noVehicles"
  )
    return "vehiclesDone";
  return null;
}
export function scheduleExample(
  show: () => void,
  schedule = setTimeout,
  cancel = clearTimeout,
) {
  const timer = schedule(show, 25000);
  return () => cancel(timer);
}

export async function writeProgress(
  storage: { setItem(key: string, value: string): Promise<void> },
  progress: Progress,
) {
  try {
    await storage.setItem(KEY, JSON.stringify(progress));
  } catch (error) {
    console.warn("Onboarding: falha ao salvar", error);
  }
}

export function tutorialPresentation(
  step: Exclude<Step, null>,
  routeAvailable: boolean,
) {
  return {
    radarIntro: {title: "Radar de Espera", description: "Que tal deixar o NoPonto acompanhar seu transporte por você? Conheça os avisos de chegada, notificações e narração por voz.", progress: 0},
    radarStop: {title: "Escolha onde deseja esperar", description: "O Radar acompanha os transportes que passam pela parada selecionada. Use Trocar parada para escolher um local. Sem uma parada disponível, você pode continuar com as explicações.", progress: 1},
    radarLines: {title: "Escolha quais linhas acompanhar", description: "Você pode acompanhar uma ou várias linhas nessa parada. Experimente os controles se quiser; não é necessário salvar.", progress: 2},
    radarStart: {title: "O Radar acompanha por você", description: "Ele observa as chegadas e permite receber avisos enquanto você espera. Ativar Radar inicia uma sessão real. Você pode continuar sem ativar.", progress: 3},
    radarDone: {title: "Radar conhecido!", description: "Agora vamos ver como o NoPonto pode avisar quando seu transporte estiver chegando.", progress: 4},
    notificationIntro: {title: "Receba avisos de chegada", description: "O NoPonto pode avisar quando o transporte estiver próximo, sem você precisar acompanhar o mapa o tempo todo.", progress: 0},
    notificationTiming: {title: "Escolha quando ser avisado", description: "Defina a antecedência que faz mais sentido para você. Os controles mostram os intervalos disponíveis. Você pode continuar sem salvar.", progress: 1},
    notificationLines: {title: "Acompanhe mais de uma linha", description: "Se você espera diferentes transportes, o Radar pode acompanhar as linhas selecionadas. Não é necessário adicionar outras linhas.", progress: 2},
    notificationPreview: {title: "Como são os avisos?", description: "Esta é uma demonstração educativa. Nenhuma notificação será enviada.", progress: 3},
    notificationBackground: {title: "Continue sua viagem sem ficar olhando a tela", description: "Com o Radar configurado, você pode receber avisos enquanto usa o celular. O funcionamento depende das permissões, conexão e disponibilidade de dados.", progress: 4},
    notificationsDone: {title: "Você já conhece as notificações!", description: "Mas e se o NoPonto pudesse falar com você?", progress: 5},
    voiceIntro: {title: "Prefere ouvir os avisos?", description: "O NoPonto também pode anunciar as chegadas por voz. Abra as opções para conhecer os controles.", progress: 0},
    voiceEnable: {title: "Ative os avisos por voz", description: "Com a narração ativada, você pode ouvir informações sobre os transportes acompanhados. Ativar é opcional e não inicia o Radar.", progress: 1},
    voiceChoice: {title: "Escolha a voz do assistente", description: "Selecione a voz que você prefere ouvir. A disponibilidade depende das vozes instaladas no aparelho.", progress: 2},
    voicePreview: {title: "Quer ouvir como funciona?", description: "Toque em Ouvir exemplo para escutar uma demonstração. A prévia respeita a saída de áudio e pode exigir fones. Você pode continuar sem áudio.", progress: 3},
    voiceOptions: {title: "Personalize seus anúncios", description: "Escolha a antecedência, os veículos, a frequência e o tipo de anúncio. As alterações feitas por você são salvas automaticamente.", progress: 4},
    voiceHeadphones: {title: "Ouça com mais privacidade", description: "Você pode configurar a narração para funcionar somente com fones conectados.", progress: 5},
    voiceMute: {title: "Silencie quando quiser", description: "Você pode silenciar a voz sem encerrar o acompanhamento. Quando a voz estiver ativa, a notificação oferece Silenciar voz. No painel, Ativar voz permite voltar a ouvir quando disponível.", progress: 6},
    voiceSave: {title: "Tudo do seu jeito", description: "As preferências de voz são salvas a cada alteração. Linhas e antecedência do Radar usam o botão Salvar alterações ou Ativar Radar. Salvar pode iniciar uma sessão real; faça isso apenas se desejar.", progress: 7},
    radarChapterDone: {title: "Agora o NoPonto acompanha você!", description: "Você já conhece o Radar, as notificações e os avisos por voz. Próximo assunto: Conhecendo outros transportes.", progress: 8},
    transportIntro: {title: "Outros transportes", description: "Além dos ônibus, você também pode explorar BRT e trens pelo NoPonto.", progress: 0},
    transportFilters: {title: "Escolha seu transporte", description: "Use os filtros para encontrar ônibus, BRT ou trem. Toque no seletor da busca para conhecer as opções disponíveis.", progress: 1},
    transportBrt: {title: "Explore as linhas de BRT", description: "Selecione BRT no filtro para encontrar linhas, acompanhar trajetos e conhecer as estações disponíveis. Buscar e selecionar uma linha é opcional. Se não houver resultados, você pode continuar.", progress: 2},
    transportRail: {title: "Explore os ramais de trem", description: "Selecione Trem no filtro para consultar ramais, estações e informações disponíveis sobre próximas viagens. Você pode continuar sem escolher outro ramal.", progress: 3},
    railStatus: {title: "Entenda as informações dos trens", description: "Os indicadores mostram a origem e a atualização da informação. Disponibilidade e sinal podem variar.", progress: 4},
    transportMap: {title: "Tudo em um só mapa", description: "Você pode alternar entre transportes e explorar diferentes trajetos quando quiser. Feche a busca para voltar ao mapa; suas seleções continuam disponíveis.", progress: 5},
    journeyDone: {title: "Pronto para seguir viagem!", description: "Agora você já conhece os principais recursos do NoPonto.", progress: 6},
    welcome: {
      title: "Seu transporte, sem complicação.",
      description: "Acompanhe ônibus, BRT e trens em um só lugar.",
      progress: 0,
    },
    invite: {
      title: "Vamos explorar juntos?",
      description: "Aprenda na prática, usando a busca e o mapa.",
      progress: 0,
    },
    search: {
      title: "Vamos encontrar sua linha?",
      description: "Pesquise uma linha que você costuma usar.",
      progress: 1,
    },
    route: {
      title: routeAvailable
        ? "Esse é o caminho da sua linha."
        : "Sua linha foi selecionada.",
      description: routeAvailable
        ? "O traçado mostra por onde ela passa."
        : "O itinerário aparece quando disponível. Você pode continuar explorando.",
      progress: 2,
    },
    vehiclesIntro: {
      title: "Veículos em tempo real",
      description: "Veja onde estão os veículos disponíveis da sua linha.",
      progress: 0,
    },
    vehicle: {
      title: "Onde está seu transporte?",
      description:
        "Os marcadores mostram os veículos disponíveis. Toque em um para ver mais informações.",
      progress: 1,
    },
    vehicleDetails: {
      title: "Conheça seu veículo",
      description:
        "Consulte a identificação e o estado da localização no painel. Os dados variam conforme a disponibilidade do sinal.",
      progress: 2,
    },
    noVehicles: {
      title: "Nenhum veículo disponível agora",
      description: "Você ainda pode conhecer como funciona o acompanhamento.",
      progress: 1,
    },
    vehicleDemo: {
      title: "Demonstração",
      description:
        "Exemplo ilustrativo, sem dados ao vivo. No mapa real, toque no marcador para consultar as informações disponíveis.",
      progress: 2,
    },
    vehiclesDone: {
      title: "Agora você sabe acompanhar os veículos!",
      description:
        "Na próxima etapa, vamos descobrir onde embarcar. Próximo assunto: Paradas, estações e terminais.",
      progress: 3,
    },
    stopsIntro: {
      title: "Paradas, estações e terminais",
      description:
        "Vamos descobrir onde você pode embarcar e quais transportes passam por cada lugar.",
      progress: 0,
    },
    stop: {
      title: "Onde você pode embarcar?",
      description:
        "Esses marcadores mostram os locais de embarque da linha. Toque em um para conhecer o local.",
      progress: 1,
    },
    stopDetails: {
      title: "Conheça esta parada",
      description:
        "Consulte o nome, as linhas e as informações disponíveis neste local. Chegadas e destinos aparecem quando disponíveis.",
      progress: 2,
    },
    noStops: {
      title: "Nenhuma parada disponível agora",
      description:
        "Você ainda pode conhecer como consultar os locais de embarque.",
      progress: 1,
    },
    stopDemo: {
      title: "Demonstração",
      description:
        "Explicação ilustrativa, sem dados ao vivo. Toque em uma parada no mapa para consultar seu nome, as linhas e outras informações disponíveis.",
      progress: 2,
    },
    stations: {
      title: "E as estações e terminais?",
      description:
        "Você também pode explorar estações de trem, BRT e terminais pelo mapa. As informações variam conforme o local e a disponibilidade dos dados.",
      progress: 2,
    },
    stopsDone: {
      title: "Agora você sabe explorar as paradas!",
      description:
        "Você já consegue encontrar locais de embarque e consultar suas informações. Próximo capítulo: Suas linhas, do seu jeito.",
      progress: 3,
    },
    linesIntro: {
      title: "Suas linhas, do seu jeito",
      description:
        "Organize o mapa e acompanhe as linhas que mais importam para você.",
      progress: 0,
    },
    lineControls: {
      title: "Personalize sua linha",
      description:
        "Você pode mudar a aparência e escolher o que aparece no mapa. Toque na linha para abrir seus controles.",
      progress: 1,
    },
    lineDirection: {
      title: "Escolha o sentido",
      description:
        "Veja o trajeto de ida, volta ou os sentidos disponíveis. Você pode experimentar ou continuar sem mudar.",
      progress: 2,
    },
    lineColor: {
      title: "Deixe o mapa do seu jeito",
      description:
        "Escolha uma cor para identificar sua linha com facilidade. Se preferir, continue sem alterar.",
      progress: 3,
    },
    lineFavorite: {
      title: "Salve suas linhas favoritas",
      description:
        "Assim, fica mais fácil encontrar as linhas que você usa com frequência. Favoritar é opcional.",
      progress: 4,
    },
    lineVisibility: {
      title: "Mantenha seu mapa organizado",
      description:
        "Você pode esconder temporariamente uma linha. Ela continua na sua seleção.",
      progress: 5,
    },
    lineRemove: {
      title: "E quando não precisar mais?",
      description:
        "Remover tira a linha da seleção. Não é necessário remover nada para concluir o tutorial.",
      progress: 6,
    },
    lineTab: {
      title: "Conheça a aba Linhas",
      description:
        "Você também pode encontrar linhas e consultar suas informações pela aba Linhas. Depois, volte ao mapa para continuar.",
      progress: 7,
    },
    linesDone: {
      title: "Seu mapa, suas escolhas!",
      description:
        "Agora você sabe como personalizar e organizar suas linhas. Próximo assunto: Radar de Espera e avisos por voz.",
      progress: 8,
    },
    done: {
      title: "Pronto para explorar!",
      description:
        "Agora você já sabe como encontrar uma linha e acompanhar seu trajeto.",
      progress: 3,
    },
  }[step];
}

export const RADAR_STEPS: NonNullable<Step>[] = ["radarIntro", "radarStop", "radarLines", "radarStart", "radarDone", "notificationIntro", "notificationTiming", "notificationLines", "notificationPreview", "notificationBackground", "notificationsDone", "voiceIntro", "voiceEnable", "voiceChoice", "voicePreview", "voiceOptions", "voiceHeadphones", "voiceMute", "voiceSave", "radarChapterDone"];
export function radarSection(step: Step) {
 const index = RADAR_STEPS.indexOf(step!);
 return index < 0 ? null : index < 5 ? "5A" : index < 11 ? "5B" : "5C";
}
export function transportSearchStep(step: Step) {
  return ["transportFilters", "transportBrt", "transportRail"].includes(step ?? "");
}
export const RAIL_STATUS_GUIDE = [
  {label: "Programado", description: "Horário previsto pela grade; a viagem ainda não foi confirmada em tempo real."},
  {label: "Estimado", description: "Previsão calculada ou ajustada com as informações disponíveis."},
  {label: "Ao vivo", description: "Informação baseada em evidências recentes de acompanhamento; pode variar com o sinal."},
];
export function chapterOf(step: Step): 1 | 2 | 3 | 4 | 5 | 6 {
  if (step?.startsWith("transport") || step === "railStatus" || step === "journeyDone") return 6;
  if (RADAR_STEPS.includes(step!)) return 5;
  if (step?.startsWith("line")) return 4;
  if (
    step &&
    (step.startsWith("stop") || step === "noStops" || step === "stations")
  )
    return 3;
  return step && (step.startsWith("vehicle") || step === "noVehicles") ? 2 : 1;
}
export type TutorialRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function unionTargets(
  a: TutorialRect | null,
  b: TutorialRect | null,
): TutorialRect | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x),
    y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
export function radarBlocked(step: Step) {
  return step !== null && chapterOf(step) !== 5;
}

export function linePanelStep(step: Step) {
  return [
    "lineControls",
    "lineDirection",
    "lineColor",
    "lineFavorite",
    "lineVisibility",
    "lineRemove",
  ].includes(step ?? "");
}
export function lineModalStep(step: Step) {
  return [
    "lineDirection",
    "lineColor",
    "lineVisibility",
    "lineRemove",
  ].includes(step ?? "");
}

export function tutorialCardPlacement(
  top: number,
  bottom: number,
  target: TutorialRect | null,
  contentHeight: number,
) {
  top = Math.max(0, Math.min(top, bottom));
  bottom = Math.max(top, bottom);
  const above = target ? Math.max(0, Math.min(bottom, target.y - 8) - top) : 0;
  const below = target
    ? Math.max(0, bottom - Math.max(top, target.y + target.height + 8))
    : bottom - top;
  const upper = Boolean(target && above >= below);
  let maxHeight = Math.min(bottom - top, upper ? above : below);
  // A nearly full-screen panel still leaves an accessible, scrollable compact guide.
  if (maxHeight < 64) maxHeight = Math.min(64, bottom - top);
  const height = Math.min(maxHeight, contentHeight || maxHeight);
  return {
    top: upper && above >= 64 ? top : bottom - height,
    maxHeight,
    compact: maxHeight < 200,
    upper: upper && above >= 64,
  };
}
