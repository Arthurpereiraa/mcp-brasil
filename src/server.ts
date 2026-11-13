/**
 * Implementação enxuta do Model Context Protocol (JSON-RPC 2.0) para servidores de ferramentas.
 * Transporte stdio: uma mensagem JSON por linha. Spec: https://modelcontextprotocol.io/specification
 */
import { createInterface } from "node:readline";
import { BrasilApi, BrasilApiError } from "./lib/brasilapi.js";
import { validateArgs, ValidationError } from "./lib/schema.js";
import { allTools, type Tool, type ToolContext, type ToolResult } from "./tools/index.js";

export const SERVER_NAME = "mcp-brasil";
export const SERVER_VERSION = "0.2.0";
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

const INSTRUCTIONS =
  "Ferramentas com dados públicos do Brasil via BrasilAPI. Use validar_documento antes de consultar_cnpj quando " +
  "não tiver certeza do número; para prazos e vencimentos, use calcular_prazo ou calcular_dias_uteis em vez de contar dias manualmente.";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
}

export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } };

export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
} as const;

export interface ServerOptions {
  api?: BrasilApi;
  tools?: readonly Tool[];
  now?: () => Date;
  log?: (message: string) => void;
}

export class McpServer {
  private readonly tools: Map<string, Tool>;
  private readonly ctx: ToolContext;
  private readonly log: (message: string) => void;

  constructor(options: ServerOptions = {}) {
    this.tools = new Map((options.tools ?? allTools).map((t) => [t.name, t]));
    this.ctx = { api: options.api ?? new BrasilApi(), now: options.now ?? (() => new Date()) };
    this.log = options.log ?? (() => {});
  }

  /** Processa uma mensagem já decodificada. Retorna `undefined` para notificações (sem resposta). */
  async handle(message: unknown): Promise<JsonRpcResponse | undefined> {
    if (!isRequest(message)) {
      return errorResponse(null, ErrorCode.InvalidRequest, "Requisição JSON-RPC inválida.");
    }
    const { id, method, params } = message;
    const isNotification = id === undefined;

    try {
      const result = await this.dispatch(method, params ?? {});
      if (isNotification) return undefined;
      if (result === METHOD_NOT_FOUND) return errorResponse(id, ErrorCode.MethodNotFound, `Método não suportado: ${method}`);
      return { jsonrpc: "2.0", id, result };
    } catch (error) {
      if (isNotification) return undefined;
      if (error instanceof RpcError) return errorResponse(id, error.code, error.message);
      this.log(`Erro interno em ${method}: ${String(error)}`);
      return errorResponse(id, ErrorCode.InternalError, "Erro interno do servidor.");
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case "initialize": {
        const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : undefined;
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.find((v) => v === requested) ?? SUPPORTED_PROTOCOL_VERSIONS[0];
        return {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, title: "MCP Brasil", version: SERVER_VERSION },
          instructions: INSTRUCTIONS,
        };
      }
      case "ping":
        return {};
      case "tools/list":
        return {
          tools: [...this.tools.values()].map(({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema,
            ...(annotations ? { annotations } : {}),
          })),
        };
      case "tools/call":
        return this.callTool(params);
      default:
        if (method.startsWith("notifications/")) return {};
        return METHOD_NOT_FOUND;
    }
  }

  private async callTool(params: Record<string, unknown>): Promise<ToolResult> {
    const name = params.name;
    const tool = typeof name === "string" ? this.tools.get(name) : undefined;
    if (!tool) throw new RpcError(ErrorCode.InvalidParams, `Ferramenta desconhecida: ${String(name)}`);

    try {
      const args = validateArgs(tool.inputSchema, params.arguments);
      return await tool.handler(args, this.ctx);
    } catch (error) {
      // Erros de execução viram resultados com isError: true, para que o modelo veja a mensagem e possa corrigir.
      if (error instanceof ValidationError || error instanceof BrasilApiError) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
      this.log(`Erro na ferramenta ${tool.name}: ${String(error)}`);
      return { content: [{ type: "text", text: `Erro inesperado ao executar ${tool.name}.` }], isError: true };
    }
  }
}

/** Liga o servidor a stdin/stdout. Logs vão para stderr para não corromper o protocolo. */
export function serveStdio(
  server: McpServer,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): void {
  const rl = createInterface({ input, crlfDelay: Infinity });
  const write = (msg: JsonRpcResponse) => output.write(`${JSON.stringify(msg)}\n`);

  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      write(errorResponse(null, ErrorCode.ParseError, "JSON inválido."));
      return;
    }
    const batch = Array.isArray(message) ? message : [message];
    for (const item of batch) {
      void server.handle(item).then((response) => response && write(response));
    }
  });
}

const METHOD_NOT_FOUND = Symbol("method-not-found");

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.jsonrpc === "2.0" && typeof v.method === "string" &&
    (v.params === undefined || (typeof v.params === "object" && v.params !== null && !Array.isArray(v.params)));
}

function errorResponse(id: JsonRpcId | undefined, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
