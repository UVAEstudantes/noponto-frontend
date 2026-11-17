import type { ConfiguracaoRemota } from './radarRemotoCore';
export interface RadarProgramacao {
  id: string; nome: string; fuso: string; horaLocal: string; dataLocal: string | null;
  dias: number[]; estado: string; configuracao: ConfiguracaoRemota;
  proximaExecucaoUtc: string | null; ultimaOcorrenciaUtc: string | null; ultimoResultado: string | null; revisao: number;
}
export interface RadarProgramacaoRequest {
  nome: string; fuso: string; horaLocal: string; dataLocal: string | null; dias: number[];
  ativa: boolean; revisaoEsperada: number;
  configuracao: ConfiguracaoRemota & { revisaoEsperada: 0; sessaoId: null };
}
export function pedidoProgramacao(p: Omit<RadarProgramacao, 'id' | 'proximaExecucaoUtc' | 'ultimaOcorrenciaUtc' | 'ultimoResultado'>): RadarProgramacaoRequest {
  return { nome: p.nome.trim() || `Radar ${p.horaLocal.slice(0, 5)}`, fuso: p.fuso,
    horaLocal: p.horaLocal.length === 5 ? `${p.horaLocal}:00` : p.horaLocal,
    dataLocal: p.dataLocal, dias: p.dataLocal ? [] : p.dias, ativa: p.estado === 'ativa', revisaoEsperada: p.revisao,
    configuracao: { ...p.configuracao, revisaoEsperada: 0, sessaoId: null } };
}
export function mensagemProgramacao(e: unknown): string {
  const code = (e as { code?: string })?.code;
  return ({ horarios_sobrepostos: 'Este horário conflita com outra programação. Cada programação ocupa uma hora; horários adjacentes são permitidos.',
    revisao_desatualizada: 'A programação mudou. Os dados foram atualizados; confira antes de salvar novamente.',
    permissao_negada: 'Autorize as notificações nas configurações Android para programar o Radar.',
    push_pendente: 'Aguardando confirmação push. Mantenha o aplicativo aberto e tente salvar novamente.',
    limite_de_programacoes: 'Você pode ter até 20 programações.',
    horario_sem_ocorrencia_futura: 'Escolha uma data e horário futuros.' } as Record<string, string>)[code ?? ''] ?? 'Não foi possível concluir. Confira a conexão e a compatibilidade da parada e tente novamente.';
}

/** Prévia no mesmo fuso; o servidor resolve também fusos diferentes e transições de horário. */
export function conflitoVisual(a: RadarProgramacao, b: RadarProgramacao): boolean {
  if (a.id && a.id === b.id || a.estado !== 'ativa' || b.estado !== 'ativa' || a.fuso !== b.fuso) return false;
  const minutos = (h: string) => Number(h.slice(0,2)) * 60 + Number(h.slice(3,5));
  const inicio = (p: RadarProgramacao, date: string) => new Date(`${date}T00:00:00Z`).getTime() / 60000 + minutos(p.horaLocal);
  if (a.dataLocal || b.dataLocal) {
    const single = a.dataLocal ? a : b, other = a.dataLocal ? b : a;
    const date = single.dataLocal!;
    const x = inicio(single, date);
    if (other.dataLocal) return Math.abs(x - inicio(other, other.dataLocal)) < 60;
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return [-1,0,1].some(offset => other.dias.includes((day + offset + 7) % 7)
      && Math.abs(x - (inicio(other,date) + offset * 1440)) < 60);
  }
  return a.dias.some(da => b.dias.some(db => [-10080,0,10080].some(week =>
    Math.abs(da * 1440 + minutos(a.horaLocal) - (db * 1440 + minutos(b.horaLocal) + week)) < 60)));
}
