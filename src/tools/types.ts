import type { BrasilApi } from "../lib/brasilapi.js";
import type { ObjectSchema } from "../lib/schema.js";

export interface ToolContext {
  api: BrasilApi;
  /** Data "de hoje" injetável, para testes determinísticos. */
  now: () => Date;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: ObjectSchema;
  annotations?: {
    readOnlyHint?: boolean;
    openWorldHint?: boolean;
    idempotentHint?: boolean;
  };
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

/** Ferramenta somente-leitura que consulta a internet. */
export const REMOTE = { readOnlyHint: true, openWorldHint: true, idempotentHint: true } as const;
/** Ferramenta somente-leitura calculada localmente. */
export const LOCAL = { readOnlyHint: true, openWorldHint: false, idempotentHint: true } as const;

export const json = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

export const text = (value: string): ToolResult => ({ content: [{ type: "text", text: value }] });

export const fail = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/** Copia só as chaves existentes, para enxugar respostas grandes antes de mandá-las ao modelo. */
export function pick<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") out[key] = obj[key];
  return out;
}
