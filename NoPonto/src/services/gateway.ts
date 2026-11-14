import { config } from '../config/env';
import { dominioNgrok } from './radarRemotoHttp';

export type GatewayStatus = 'checking' | 'online' | 'offline' | 'unavailable' | 'unknown';
export type SourceStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown';
export type ReadyStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type Snapshot = { active: number; status: GatewayStatus; revision: number;
  readiness: ReadyStatus; sources: { sppo: SourceStatus; brt: SourceStatus };
  confirmed: { sppo: boolean; brt: boolean } };
const sourceStatus = (value: unknown): SourceStatus =>
  ['healthy', 'degraded', 'unavailable', 'unknown'].includes(String(value)) ? value as SourceStatus : 'unknown';
// Only liveness decides gateway selection; readiness and collectors share the backend.
export function createGateway(primary: string, fallback: string, transport: typeof fetch = fetch, now = Date.now) {
  const urls = [primary, fallback];
  let state: Snapshot = { active: 0, status: 'checking', revision: 0, readiness: 'unknown', sources: { sppo: 'unknown', brt: 'unknown' }, confirmed: { sppo: false, brt: false } };
  const listeners = new Set<() => void>();
  let pending: Promise<void> | null = null, failures = 0, recovered = 0, switched = 0, lastCheck = -Infinity;
  let offline = false, hubFailures = 0, hubFallback = false;
  let lastServices = -Infinity;
  const unavailable = { sppo: 0, brt: 0 };
  const name = (index: number) => index === 0 ? 'zrok' : 'ngrok';
  const publish = (status: GatewayStatus, active = state.active) => {
    if (state.status === status && state.active === active) return;
    const previous = state;
    state = { ...state, status, active, revision: state.revision + 1 };
    if (status !== 'online' || active !== previous.active) {
      lastServices = -Infinity; unavailable.sppo = unavailable.brt = 0;
      state = { ...state, readiness: 'unknown', sources: { sppo: 'unknown', brt: 'unknown' }, confirmed: { sppo: false, brt: false } };
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[Gateway]', new Date(now()).toISOString(), name(previous.active), '->', name(active), previous.status, '->', status);
    listeners.forEach(fn => fn());
  };
  async function healthRequest(index: number, path: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const response = await transport(new URL(path, urls[index]).toString(), {
        signal: controller.signal, headers: dominioNgrok(new URL(urls[index]).hostname) ? { 'ngrok-skip-browser-warning': '1' } : {},
      });
      // Read the body inside the timeout too; tunnel HTML is never a health result.
      return { status: response.status, ok: response.ok, text: await response.text() };
    } finally { clearTimeout(timer); }
  }
  async function probe(index: number) {
    if (!urls[index]) return false;
    try {
      const response = await healthRequest(index, '/health/live');
      if (response.status === 404) {
        const legacy = await healthRequest(index, '/');
        return legacy.ok && legacy.text.trim() === 'Hello World!';
      }
      return response.ok && JSON.parse(response.text).status === 'healthy';
    } catch { return false; }
  }
  async function services() {
    if (offline || state.status !== 'online' || now() - lastServices < 60000) return;
    lastServices = now();
    const active = state.active;
    const read = async (path: string) => {
      try {
        const response = await healthRequest(active, path);
        if (!response.ok && !(path === '/health/ready' && response.status === 503)) return null;
        return JSON.parse(response.text);
      } catch { return null; }
    };
    const [ready, sources] = await Promise.all([read('/health/ready'), read('/health/fontes')]);
    if (offline || state.active !== active || state.status !== 'online') return;
    const readiness: ReadyStatus = ['healthy', 'degraded', 'unhealthy'].includes(ready?.status) ? ready.status : 'unknown';
    const nextSources = { sppo: sourceStatus(sources?.sources?.sppo?.status), brt: sourceStatus(sources?.sources?.brt?.status) };
    for (const mode of ['sppo', 'brt'] as const) unavailable[mode] = nextSources[mode] === 'unavailable' ? unavailable[mode] + 1 : 0;
    state = { ...state, readiness, sources: nextSources,
      confirmed: { sppo: unavailable.sppo >= 2, brt: unavailable.brt >= 2 }, revision: state.revision + 1 };
    listeners.forEach(fn => fn());
  }
  async function run(initial: boolean) {
    if (offline) { publish('offline'); return; }
    const active = state.active;
    let healthy = await probe(active);
    if (initial && !healthy) healthy = await probe(active);
    if (offline) return;
    if (healthy) {
      failures = 0;
      publish('online');
      if (active === 1) {
        recovered = await probe(0) && (!hubFallback || await probeHub(0)) ? recovered + 1 : 0;
        if (!offline && recovered >= 2 && now() - switched >= 180000) {
          switched = now(); recovered = 0; hubFallback = false; publish('online', 0);
        }
      }
      return;
    }
    recovered = 0; failures++;
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[Gateway]', new Date(now()).toISOString(), 'Falha de health', name(active), `${failures}/3`);
    if (!initial && failures < 3) return;
    const alternative = active === 0 ? 1 : 0;
    const available = await probe(alternative);
    if (offline) return;
    if (available) {
      failures = 0; switched = now(); publish('online', alternative);
    } else publish('unavailable');
  }
  function probeHub(index: number): Promise<boolean> {
    return new Promise(resolve => {
      let socket: WebSocket | undefined;
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return; done = true; clearTimeout(timer);
        if (socket) { socket.onopen = null; socket.onmessage = null; socket.onerror = null; socket.onclose = null; try { socket.close(); } catch {} }
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), 2500);
      try {
        const url = new URL(config.GPS_HUB_ROUTE, urls[index]);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(url.toString());
        socket.onopen = () => socket?.send('{"protocol":"json","version":1}\u001e');
        socket.onmessage = event => finish(String(event.data).split('\u001e')[0] === '{}');
        socket.onerror = () => finish(false); socket.onclose = () => finish(false);
      } catch { finish(false); }
    });
  }
  const check = (initial = false) => {
    if (pending) return pending;
    if (!initial && now() - lastCheck < 10000) return Promise.resolve();
    lastCheck = now();
    pending = run(initial || state.status === 'checking').then(services).finally(() => { pending = null; listeners.forEach(fn => fn()); });
    return pending;
  };
  return {
    snapshot: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    base: () => urls[state.active] || primary,
    check,
    async hubFailure() {
      if (offline || pending || ++hubFailures < 3 || now() - switched < 180000) return;
      const alternative = state.active === 0 ? 1 : 0;
      pending = (async () => {
        if (await probe(alternative) && await probeHub(alternative) && !offline) {
          hubFailures = 0; hubFallback = true; switched = now(); publish('online', alternative);
        }
      })().finally(() => { pending = null; });
      await pending;
    },
    hubConnected() { hubFailures = 0; },
    setOffline(value: boolean) { const changed = offline !== value; offline = value; if (value) publish('offline'); else if (changed || state.status === 'checking') void check(true); },
    async request(input: string, options?: RequestInit) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      options?.signal?.addEventListener('abort', abort, { once: true });
      if (options?.signal?.aborted) controller.abort();
      const timer = setTimeout(abort, config.REQUEST_TIMEOUT_MS);
      const headers = new Headers(options?.headers);
      if (dominioNgrok(new URL(input).hostname)) headers.set('ngrok-skip-browser-warning', '1');
      try {
        const response = await transport(input, { ...options, headers, signal: controller.signal });
        if ([502, 503, 504].includes(response.status)) void check();
        return response;
      } catch (error) { if (!options?.signal?.aborted) void check(); throw error; }
      finally { clearTimeout(timer); options?.signal?.removeEventListener('abort', abort); }
    },
  };
}
export const gateway = createGateway(config.API_BASE_URL, process.env.EXPO_PUBLIC_API_FALLBACK_URL || '');
export function gatewayBase(configured = config.API_BASE_URL) {
  // Separate Radar deployments retain their origin; only the shared backend follows failover.
  return configured.replace(/\/$/, '') === config.API_BASE_URL.replace(/\/$/, '') ? gateway.base() : configured;
}
export function gatewayHubUrl() {
  const original = config.GPS_HUB_URL.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
  const url = new URL(original);
  if (url.origin === new URL(config.API_BASE_URL).origin) return new URL(url.pathname + url.search, gateway.base()).toString();
  return original;
}

// One notice per occurrence; two healthy samples rearm, with a ten-minute cooldown.
export function createHealthNotices(now = Date.now) {
  const sent = new Map<string, number>();
  const recovered = new Map<string, number>();
  let previousSources: Snapshot['sources'] | undefined;
  return (state: Snapshot) => {
    for (const mode of ['sppo', 'brt'] as const) {
      if (previousSources === state.sources) continue;
      const count = state.sources[mode] === 'healthy' ? (recovered.get(mode) || 0) + 1 : 0;
      recovered.set(mode, count);
      if (count >= 2 && now() - (sent.get(mode) ?? -Infinity) >= 600000) sent.delete(mode);
    }
    previousSources = state.sources;
    if (state.status === 'online') { sent.delete('offline'); sent.delete('unavailable'); }
    if (state.readiness === 'healthy') sent.delete('dependencies');
    if (state.active === 0) sent.delete('reserve');
    const candidates: [string, string][] = state.status === 'offline'
      ? [['offline', 'Sem conexão com a internet. Verifique sua rede para receber atualizações.']]
      : state.status === 'unavailable'
        ? [['unavailable', 'Não foi possível conectar ao NoPonto. Verifique sua rede; algumas informações podem estar temporariamente indisponíveis.']]
        : state.status !== 'online' ? [] : state.readiness === 'unhealthy'
          ? [['dependencies', 'Serviço temporariamente indisponível\nEstamos com dificuldades para acessar alguns serviços do NoPonto. Tente novamente em instantes.']]
          : [
            ...(state.confirmed.sppo ? [['sppo', 'Atualizações de ônibus indisponíveis\nEstamos com dificuldades para atualizar as posições dos ônibus. Os dados podem estar desatualizados.'] as [string, string]] : []),
            ...(state.confirmed.brt ? [['brt', 'Atualizações do BRT indisponíveis\nEstamos com dificuldades para atualizar as posições do BRT. Os dados podem estar desatualizados.'] as [string, string]] : []),
            ...(state.active === 1 ? [['reserve', 'Conexão alternativa ativada.'] as [string, string]] : []),
          ];
    for (const [key, message] of candidates) {
      if (!sent.has(key)) { sent.set(key, now()); return { key, message }; }
    }
    return null;
  };
}
