import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { config } from '@/src/config/env';

let pendente = false;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ZERO = '00000000-0000-0000-0000-000000000000';
const FALHA = 'Falha na atualização. Dados anteriores preservados.';

function diagnosticar(evento: string, dados: Record<string, unknown> = {}) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.info('[trem-refresh]', evento, dados);
}

function estadoUuid(value: unknown) {
  const exists = typeof value === 'string' && value.length > 0;
  const uuidValid = typeof value === 'string' && UUID.test(value);
  return { exists, uuidValid, nonZero: uuidValid && typeof value === 'string' && value.toLowerCase() !== UUID_ZERO };
}

function urlSemSegredos(value: string) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch { return '[URL inválida]'; }
}

function detalheErro(error: unknown) {
  const name = error instanceof Error ? error.name : 'Error';
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/([?&](?:access_token|token|api_key|key|password)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, url => urlSemSegredos(url));
  return { name, message };
}

function resumirResposta(data: unknown) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { jsonObject: false };
  const source = data as Record<string, unknown>;
  const summary: Record<string, unknown> = { jsonObject: true };
  for (const key of ['status', 'diagnostic', 'observationCount', 'retryAfterSeconds', 'retryAfter', 'code', 'title', 'traceId']) {
    const value = source[key];
    if (typeof value === 'string' || typeof value === 'number') summary[key] = value;
  }
  if (source.errors && typeof source.errors === 'object') summary.validationFields = Object.keys(source.errors);
  return summary;
}

async function obterInstalacaoId() {
  const salvoAsync = await AsyncStorage.getItem('trens.installation.v1');
  diagnosticar('installation-id.saved', { source: 'async-storage', ...estadoUuid(salvoAsync) });
  let id = estadoUuid(salvoAsync).nonZero ? salvoAsync : null;

  if (!id && Platform.OS === 'android') {
    const registro = await SecureStore.getItemAsync('radar.installation.v1', { keychainService: 'noponto.radar.dev.v1' });
    let existente: unknown = null;
    if (registro) {
      try { existente = JSON.parse(registro)?.instalacaoId; }
      catch (error) { diagnosticar('installation-id.secure-store-parse-error', detalheErro(error)); }
    }
    diagnosticar('installation-id.saved', { source: 'secure-store', ...estadoUuid(existente) });
    if (estadoUuid(existente).nonZero) id = existente as string;
  }

  if (!id) {
    id = String(Crypto.randomUUID());
    diagnosticar('installation-id.generated', estadoUuid(id));
    if (!estadoUuid(id).nonZero) throw new Error('Crypto.randomUUID returned an invalid installation UUID.');
  }
  if (id !== salvoAsync) await AsyncStorage.setItem('trens.installation.v1', id);
  diagnosticar('installation-id.ready', estadoUuid(id));
  return id;
}

export async function refreshTrens(paradaId: string, sentidoId: string) {
  const finalizar = (message: string, reason: string, extra: Record<string, unknown> = {}) => {
    diagnosticar('result', { message, reason, ...extra });
    return message;
  };
  if (pendente) return finalizar('Atualização em andamento.', 'request_already_pending');
  pendente = true;
  let phase = 'local_cooldown';
  let requestStartedAt = 0;
  let httpStatus: number | null = null;
  let contentType: string | null = null;
  try {
    const prazo = Number(await AsyncStorage.getItem('trens.refresh.prazo'));
    if (prazo > Date.now()) {
      const remainingSeconds = Math.ceil((prazo - Date.now()) / 1000);
      diagnosticar('cooldown.local-hit', { remainingSeconds });
      return finalizar(`Aguarde ${remainingSeconds} s para atualizar novamente.`, 'local_cooldown', { remainingSeconds });
    }

    phase = 'installation_id';
    const id = await obterInstalacaoId();
    const url = new URL(`/paradas/${paradaId}/trens/refresh`, config.API_BASE_URL).toString();
    const method = 'POST';
    diagnosticar('selected', { paradaId, sentidoId });
    diagnosticar('request', { method, url: urlSemSegredos(url), ...estadoUuid(id) });
    phase = 'http_request';
    requestStartedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      const request = fetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentidoId, instalacaoId: id }), signal: controller.signal,
      });
      await AsyncStorage.setItem('trens.refresh.prazo', String(Date.now() + 120000));
      diagnosticar('cooldown.local-set', { seconds: 120, reason: 'pre-request safety window' });
      response = await request;
    } finally { clearTimeout(timeout); }
    httpStatus = response.status;
    contentType = response.headers.get('content-type');
    phase = 'response_body';
    const body = await response.text();
    let data: Record<string, unknown> | null = null;
    let parseError: unknown;
    if (body.trim()) {
      try {
        const parsed: unknown = JSON.parse(body);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
      } catch (error) { parseError = error; }
    }
    const durationMs = Date.now() - requestStartedAt;
    diagnosticar('response', { httpStatus: response.status, durationMs, contentType,
      body: parseError ? { jsonObject: false, bodyLength: body.length, parseFailed: true } : resumirResposta(data) });
    if (parseError) diagnosticar('parse-error', { phase: 'response_body', ...detalheErro(parseError) });

    if (response.status === 429) {
      const retry = response.headers.get('Retry-After');
      const seconds = Number(retry);
      const agora = Date.now();
      const informado = retry ? Number.isFinite(seconds) ? agora + seconds * 1000 : Date.parse(retry) : NaN;
      const prazoRateLimit = Number.isFinite(informado) ? informado : agora + 120000;
      await AsyncStorage.setItem('trens.refresh.prazo', String(prazoRateLimit));
      const remainingSeconds = Math.ceil((prazoRateLimit - Date.now()) / 1000);
      diagnosticar('cooldown.backend', { source: 'Retry-After', value: retry, remainingSeconds });
      return finalizar(`Aguarde ${remainingSeconds} s para atualizar novamente.`, 'http_429', { remainingSeconds });
    }
    if (response.status === 503) return finalizar(FALHA, 'http_503', { diagnostic: data?.diagnostic });
    if (!response.ok) return finalizar(FALHA, `http_${response.status}`, { diagnostic: data?.diagnostic });
    if (parseError || !data) return finalizar(FALHA, 'invalid_json_response');

    if (data.status === 'RateLimited') {
      const seconds = Number(data.retryAfterSeconds);
      const cooldownSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 120;
      const prazoRateLimit = Date.now() + cooldownSeconds * 1000;
      await AsyncStorage.setItem('trens.refresh.prazo', String(prazoRateLimit));
      const remainingSeconds = Math.ceil((prazoRateLimit - Date.now()) / 1000);
      diagnosticar('cooldown.backend', { source: 'response-body', remainingSeconds });
      return finalizar(`Aguarde ${remainingSeconds} s para atualizar novamente.`, 'backend_rate_limited', { remainingSeconds });
    }
    const message = data.status === 'Updated' ? 'Atualizado agora.' : data.status === 'Reused'
      ? 'Usando dados recentes já consultados.' : data.status === 'InvalidContext'
        ? 'Sentido indisponível para esta estação.' : FALHA;
    const reason = data.status === 'Updated' || data.status === 'Reused' ? 'backend_success'
      : data.status === 'InvalidContext' ? 'backend_invalid_context' : 'unexpected_backend_status';
    return finalizar(message, reason, { backendStatus: data.status, diagnostic: data.diagnostic });
  } catch (error) {
    const details = detalheErro(error);
    const kind = phase === 'http_request' ? details.name === 'TimeoutError' || details.name === 'AbortError' ? 'timeout' : 'network'
      : phase === 'response_body' ? 'response_read' : 'local_or_storage';
    diagnosticar('error', { kind, phase, httpStatus, contentType,
      durationMs: requestStartedAt ? Date.now() - requestStartedAt : null, ...details });
    return finalizar(FALHA, `${phase}_error`, details);
  } finally { pendente = false; }
}
