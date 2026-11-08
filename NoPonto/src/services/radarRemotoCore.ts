import { diagnosticarRadar } from './radarRemotoDiagnostico';
export interface ContextoRemoto { linhaId: string; sentidoId: string; padraoOperacionalId: string; padraoVersaoId: string }
export interface ConfiguracaoRemota {
  paradaId: string; contextos: ContextoRemoto[]; linhasSelecionadas: string[];
  linhasPrioritarias: string[]; antecedenciaMinutos: number;
}
export interface SessaoRemota extends ConfiguracaoRemota {
  sessaoId: string; instalacaoId: string; revisao: number; estado: string; expiraEm: string;
}
export type OperacaoRemota = 'reconciliar' | 'ativar' | 'atualizar' | 'confirmar' | 'encerrar';
export interface EstadoRemoto {
  modo: 'inativo' | 'pendente' | 'ativo' | 'indisponivel' | 'expirado';
  sessao: SessaoRemota | null; mensagem: string | null; solicitando: boolean;
  operacao: OperacaoRemota | null;
}
interface Registro { credencial: string; instalacaoId: string; credencialExpiraEm: string }
interface Pendente { enrollmentId: string; token: string; expires: number }
export interface PortaRadarRemoto {
  request<T>(method: string, route: string, credential?: string, body?: unknown): Promise<T>;
  read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void>; remove(key: string): Promise<void>;
  token(ask: boolean): Promise<string>; id(): string; now(): number; projectId: string;
  clearNotifications(current?: SessaoRemota | null): Promise<void>;
}
export class ErroRadarRemoto extends Error { constructor(public status: number, public code = 'radar_indisponivel') { super(code); } }
const CREDENTIAL = 'radar.installation.v1', PENDING = 'radar.enrollment.v1', TOKEN = 'radar.token.v1';

/** Fila de comandos, sem polling de chegadas. Fonte de verdade e prazo são os do backend. */
export function criarRadarRemoto(port: PortaRadarRemoto) {
  let state: EstadoRemoto = { modo: 'inativo', sessao: null, mensagem: null, solicitando: false, operacao: null };
  let registration: Registro | null = null, queue = Promise.resolve<unknown>(undefined);
  const listeners = new Set<(s: EstadoRemoto) => void>();
  const emit = (value: Partial<EstadoRemoto>) => {
    if (value.modo && value.modo !== state.modo) diagnosticarRadar('estado', value.modo);
    state = { ...state, ...value }; listeners.forEach(l => l(state));
  };
  async function credential(create = false) {
    registration ??= JSON.parse(await port.read(CREDENTIAL) ?? 'null') as Registro | null;
    if (!registration && create) {
      const fresh = await port.request<Registro>('POST', '/radar/instalacoes');
      await port.write(CREDENTIAL, JSON.stringify(fresh)); // nunca ativar antes de persistir
      registration = fresh;
    }
    if (!registration) return null;
    return registration.credencial;
  }
  async function authenticated<T>(method: string, route: string, body?: unknown) {
    const cred = await credential();
    if (!cred) throw new ErroRadarRemoto(401);
    try { return await port.request<T>(method, route, cred, body); }
    catch (e) {
      if (e instanceof ErroRadarRemoto && e.status === 401) {
        registration = null;
        await Promise.all([port.remove(CREDENTIAL), port.remove(PENDING), port.remove(TOKEN)]);
        emit({ sessao: null, modo: 'indisponivel' });
        await port.clearNotifications();
      }
      throw e;
    }
  }
  function serial<T>(operacao: OperacaoRemota, fn: () => Promise<T>): Promise<T | undefined> {
    const work = queue.catch(() => {}).then(async () => {
      emit({ solicitando: true, mensagem: null, operacao });
      diagnosticarRadar(`fila.${operacao}`, 'inicio');
      try { return await fn(); }
      catch (e) {
        diagnosticarRadar(`fila.${operacao}`, 'falha', e);
        if (e instanceof ErroRadarRemoto) diagnosticarRadar(`fila.${operacao}`, `status_${e.status}`);
        // Preserva o modo/sessão conhecidos: uma falha de rede ao salvar não
        // deve transformar uma sessão ativa em "pausada" nem apagar o alvo.
        emit({ mensagem: e instanceof ErroRadarRemoto && e.status === 403
          ? `Instalação de teste aguardando autorização: ${registration?.instalacaoId ?? ''}`
          : e instanceof ErroRadarRemoto && e.status === 401 ? 'Credencial revogada. Ative novamente para registrar este aparelho.'
          : e instanceof ErroRadarRemoto && e.code === 'permissao_negada' ? 'Permissão de notificações negada. Autorize nas configurações Android e tente novamente.'
          : e instanceof ErroRadarRemoto && e.status === 422 ? 'O contexto da parada mudou ou é incompatível. Atualize a seleção antes de tentar novamente.'
          : e instanceof ErroRadarRemoto && e.status === 429 ? 'Limite temporário do Radar. Aguarde um minuto antes de tentar novamente.'
          : 'Radar remoto indisponível. Confira a conexão e tente novamente. O modo local permanece suspenso.' });
      } finally { emit({ solicitando: false, operacao: null }); diagnosticarRadar(`fila.${operacao}`, 'fim'); }
    });
    queue = work; return work;
  }
  function accept(session: SessaoRemota | null) {
    const active = session?.estado === 'ativa' && Date.parse(session.expiraEm) > port.now();
    emit({ sessao: session, modo: active ? 'ativo' : session?.estado === 'expirada' || session?.estado === 'ativa' ? 'expirado' : 'inativo' });
  }
  async function enroll(ask: boolean) {
    const status = await authenticated<{ registered: boolean; possessionConfirmed: boolean }>('GET', '/radar/instalacao/push');
    const token = await port.token(ask);
    if (status.registered && status.possessionConfirmed && await port.read(TOKEN) === token) return true;
    const old = JSON.parse(await port.read(PENDING) ?? 'null') as Pendente | null;
    if (old?.token === token && old.expires > port.now()) { emit({ modo: 'pendente' }); return false; }
    const pending = { enrollmentId: port.id(), token, expires: port.now() + 120000 };
    await port.write(PENDING, JSON.stringify(pending));
    emit({ modo: 'pendente', mensagem: 'Aguardando confirmação push neste aparelho. Mantenha o app aberto.' });
    await authenticated('POST', '/radar/instalacao/push/confirmacoes', {
      enrollmentId: pending.enrollmentId, projectId: port.projectId, expoPushToken: token,
    });
    return false;
  }
  let desired: ConfiguracaoRemota | null = null;
  async function configure(config: ConfiguracaoRemota, allowActivation = false) {
    const current = await authenticated<SessaoRemota | null>('GET', '/radar/sessao');
    accept(current);
    const active = current?.estado === 'ativa' && Date.parse(current.expiraEm) > port.now();
    if (!active && !allowActivation) return;
    // O modo real (ativo/expirado) permanece visível; `solicitando` já informa
    // a operação em andamento. "pendente" é reservado ao enrollment push.
    await port.clearNotifications();
    try {
      const next = await authenticated<SessaoRemota>(active ? 'PUT' : 'POST', '/radar/sessao', {
        ...config, revisaoEsperada: active ? current.revisao : 0, ...(active ? { sessaoId: current.sessaoId } : {}),
      });
      accept(next); await port.clearNotifications(next);
    } catch (e) {
      if (!(e instanceof ErroRadarRemoto) || e.status !== 409) throw e;
      let latest = await authenticated<SessaoRemota | null>('GET', '/radar/sessao');
      accept(latest);
      if (!active && latest?.estado === 'ativa') {
        // A sessão ficou ativa entre o GET e o POST (reconexão/corrida). Em vez
        // de exigir que o usuário troque de parada para tentar de novo, aplica
        // a configuração desejada sobre a sessão que já existe.
        try {
          const next = await authenticated<SessaoRemota>('PUT', '/radar/sessao', {
            ...config, revisaoEsperada: latest.revisao, sessaoId: latest.sessaoId,
          });
          accept(next); await port.clearNotifications(next); return;
        } catch (retry) {
          if (!(retry instanceof ErroRadarRemoto) || retry.status !== 409) throw retry;
          latest = await authenticated<SessaoRemota | null>('GET', '/radar/sessao');
          accept(latest);
        }
      }
      emit({ mensagem: 'A sessão mudou. Confira a configuração antes de salvar novamente.' });
    }
  }
  return {
    get estado() { return state; },
    assinar(fn: (s: EstadoRemoto) => void) { listeners.add(fn); fn(state); return () => { listeners.delete(fn); }; },
    reconciliar: () => serial('reconciliar', async () => {
      if (!await credential()) { emit({ modo: 'inativo' }); return; }
      const meta = await authenticated<{ credencialExpiraEm: string }>('GET', '/radar/instalacao');
      if (Date.parse(meta.credencialExpiraEm) - port.now() <= 30 * 86400000)
        await authenticated('POST', '/radar/instalacao/renovar');
      accept(await authenticated<SessaoRemota | null>('GET', '/radar/sessao'));
      await port.clearNotifications(state.sessao);
      if (state.modo === 'ativo') await enroll(false);
    }),
    ativar: (config: ConfiguracaoRemota) => serial('ativar', async () => {
      desired = config;
      await credential(true);
      if (await enroll(true)) { desired = null; await configure(config, true); }
    }),
    atualizar: (config: ConfiguracaoRemota) => serial('atualizar', async () => {
      if (state.sessao?.estado !== 'ativa' || Date.parse(state.sessao.expiraEm) <= port.now()) return;
      await configure(config); // nunca renova sessão expirada como efeito de preferências
    }),
    confirmar: (data: Record<string, unknown>) => serial('confirmar', async () => {
      const p = JSON.parse(await port.read(PENDING) ?? 'null') as Pendente | null;
      if (!p || p.expires <= port.now() || data.mode !== 'radar-enrollment' || data.projectId !== port.projectId
        || data.enrollmentId !== p.enrollmentId || typeof data.proof !== 'string' || !/^[A-F0-9]{64}$/.test(data.proof)) {
        diagnosticarRadar('push.prova', 'ignorada_por_validacao'); return;
      }
      diagnosticarRadar('push.prova', 'valida');
      await authenticated('POST', '/radar/instalacao/push/confirmar', { enrollmentId: p.enrollmentId, proof: data.proof });
      await port.write(TOKEN, p.token); await port.remove(PENDING);
      const config = desired; desired = null;
      if (config) await configure(config, true);
      else accept(await authenticated<SessaoRemota | null>('GET', '/radar/sessao'));
    }),
    encerrar: () => serial('encerrar', async () => {
      desired = null; await port.remove(PENDING);
      if (await credential()) {
        const session = await authenticated<SessaoRemota | null>('GET', '/radar/sessao');
        if (session) await authenticated('DELETE', `/radar/sessao/${session.sessaoId}`);
      }
      await port.clearNotifications(); emit({ modo: 'inativo', sessao: null });
    }),
    expirar() { if (state.sessao?.estado === 'ativa' && Date.parse(state.sessao.expiraEm) <= port.now()) emit({ modo: 'expirado' }); },
    permite(data: Record<string, unknown>) {
      const current = state.sessao;
      return current != null && data.mode === 'remote-radar' && state.modo === 'ativo' && current.sessaoId === data.sessionId
        && current.revisao === data.revision && Date.parse(String(data.validUntil)) > port.now()
        && Date.parse(current.expiraEm) > port.now();
    },
  };
}
