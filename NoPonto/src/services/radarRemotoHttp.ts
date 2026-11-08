// Transporte HTTP puro do Radar remoto: cabeçalhos, ngrok e leitura de resposta.
// Sem dependências nativas para permitir testes direcionados.

export const NGROK_SKIP_WARNING = 'ngrok-skip-browser-warning';

const SUFIXOS_NGROK = [
  'ngrok-free.dev',
  'ngrok-free.app',
  'ngrok.io',
  'ngrok.app',
  'ngrok.dev',
];

/** Domínios ngrok (inclusive subdomínios) exigem o header anti-interstitial. */
export function dominioNgrok(hostname: string | null | undefined): boolean {
  const host = (hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  return SUFIXOS_NGROK.some(
    sufixo => host === sufixo || host.endsWith(`.${sufixo}`)
  );
}

export function criarCabecalhosRadar(
  credencial?: string,
  hostname?: string
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(dominioNgrok(hostname) ? { [NGROK_SKIP_WARNING]: '1' } : {}),
    ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}),
  };
}

export interface OpcoesRequisicaoRadar {
  method: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * Mesmos cabeçalhos para GET, POST, PUT e DELETE. O header do ngrok depende
 * apenas do host, nunca do método ou do corpo.
 */
export function opcoesRequisicaoRadar(
  method: string,
  hostname: string,
  credencial?: string,
  body?: unknown
): OpcoesRequisicaoRadar {
  return {
    method,
    headers: criarCabecalhosRadar(credencial, hostname),
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export type CategoriaRespostaRadar =
  | 'json'
  | 'problema'
  | 'ngrok'
  | 'html'
  | 'texto'
  | 'json_invalido'
  | 'vazio';

export interface DiagnosticoRespostaRadar {
  status: number;
  categoria: CategoriaRespostaRadar;
  contentType: string;
  mensagem: string;
}

export type RespostaRadar<T> =
  | { ok: true; status: number; dados: T | null }
  | {
      ok: false;
      status: number;
      codigo?: string;
      diagnostico: DiagnosticoRespostaRadar;
    };

function diagnostico(
  status: number,
  categoria: CategoriaRespostaRadar,
  contentType: string
): DiagnosticoRespostaRadar {
  const tipo = contentType || 'sem content-type';
  const prefixo = `Radar remoto respondeu HTTP ${status} (${tipo})`;
  const mensagem =
    categoria === 'ngrok'
      ? `${prefixo} com a página de aviso do ngrok. O header ${NGROK_SKIP_WARNING} não foi aplicado ou o túnel redirecionou a requisição.`
      : categoria === 'html'
        ? `${prefixo} com HTML inesperado. Verifique a URL base da API e o proxy.`
        : categoria === 'texto'
          ? `${prefixo} com texto inesperado em vez de JSON. Verifique a URL base da API.`
          : categoria === 'json_invalido'
            ? `${prefixo} com JSON inválido. Verifique a resposta do backend/proxy.`
            : categoria === 'vazio'
              ? `${prefixo} com corpo vazio inesperado.`
              : categoria === 'problema'
                ? `${prefixo} com erro do backend.`
                : `${prefixo} com JSON.`;

  // Nunca inclui corpo, token ou credencial: apenas status e content-type.
  return { status, categoria, contentType, mensagem };
}

/**
 * Lê o corpo uma única vez e só interpreta como JSON quando o formato indica
 * JSON. Páginas de aviso do ngrok e HTML são classificadas antes do parse.
 */
export async function interpretarRespostaRadar<T>(
  response: Response
): Promise<RespostaRadar<T>> {
  const contentType = (response.headers.get('content-type') ?? '')
    .trim()
    .toLowerCase();
  const texto = await response.text();
  const inicio = texto.trimStart();

  if (response.status === 204 || inicio === '') {
    return response.ok
      ? { ok: true, status: response.status, dados: null }
      : {
          ok: false,
          status: response.status,
          diagnostico: diagnostico(response.status, 'vazio', contentType),
        };
  }

  // Alguns proxies rotulam JSON como text/plain; ainda assim só tentamos o
  // parse quando o próprio corpo tem cara de JSON.
  const tentarJson =
    contentType.includes('json') ||
    inicio.startsWith('{') ||
    inicio.startsWith('[');

  if (tentarJson) {
    try {
      const dados = JSON.parse(texto) as T;
      if (response.ok) {
        return { ok: true, status: response.status, dados };
      }
      const codigo =
        dados && typeof dados === 'object' && 'code' in dados
        && typeof (dados as { code?: unknown }).code === 'string'
          ? (dados as { code: string }).code
          : undefined;
      return {
        ok: false,
        status: response.status,
        codigo,
        diagnostico: diagnostico(response.status, 'problema', contentType),
      };
    } catch {
      return {
        ok: false,
        status: response.status,
        diagnostico: diagnostico(
          response.status,
          'json_invalido',
          contentType
        ),
      };
    }
  }

  const categoria: CategoriaRespostaRadar =
    /you are about to visit/i.test(inicio.slice(0, 1024))
      ? 'ngrok'
      : inicio.startsWith('<')
        ? 'html'
        : 'texto';

  return {
    ok: false,
    status: response.status,
    diagnostico: diagnostico(response.status, categoria, contentType),
  };
}
