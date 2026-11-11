/** Cliente HTTP mínimo para a BrasilAPI (https://brasilapi.com.br), com timeout e cache em memória. */

export class BrasilApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BrasilApiError";
  }
}

export interface BrasilApiOptions {
  baseUrl?: string;
  timeoutMs?: number;
  /** TTL do cache em ms. 0 desativa o cache. */
  cacheTtlMs?: number;
  fetch?: typeof globalThis.fetch;
}

interface CacheEntry {
  expires: number;
  value: unknown;
}

export class BrasilApi {
  readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: BrasilApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "https://brasilapi.com.br/api").replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.cacheTtlMs = options.cacheTtlMs ?? 5 * 60_000;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async get<T = unknown>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    const cached = this.cache.get(url);
    if (cached && cached.expires > Date.now()) return cached.value as T;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: "application/json", "user-agent": "mcp-brasil" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError"
        ? `tempo esgotado após ${this.timeoutMs} ms`
        : error instanceof Error ? error.message : String(error);
      throw new BrasilApiError(`Falha ao acessar a BrasilAPI: ${reason}`);
    }

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const apiMessage =
        body && typeof body === "object" && "message" in body && typeof body.message === "string"
          ? body.message
          : undefined;
      const fallback =
        response.status === 404 ? "Não encontrado." :
        response.status === 429 ? "Limite de requisições atingido; tente novamente em instantes." :
        `Erro HTTP ${response.status}.`;
      throw new BrasilApiError(apiMessage ?? fallback, response.status);
    }

    if (this.cacheTtlMs > 0) this.cache.set(url, { expires: Date.now() + this.cacheTtlMs, value: body });
    return body as T;
  }
}
