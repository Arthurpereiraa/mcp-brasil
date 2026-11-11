import { BrasilApi } from "../src/lib/brasilapi.js";
import { McpServer } from "../src/server.js";

type Route = unknown | ((url: string) => { status: number; body: unknown });

/** Cria um fetch falso: cada caminho da BrasilAPI aponta para um corpo JSON (status 200) ou para uma função. */
export function fakeFetch(routes: Record<string, Route>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const path = url.replace("https://brasilapi.com.br/api", "");
    if (!(path in routes)) {
      return new Response(JSON.stringify({ message: "Rota não mockada" }), { status: 404 });
    }
    const route = routes[path];
    const { status, body } = typeof route === "function" ? (route as (u: string) => { status: number; body: unknown })(url) : { status: 200, body: route };
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { impl, calls };
}

export function makeServer(routes: Record<string, Route> = {}, now = new Date("2026-11-11T12:00:00Z")) {
  const fetch = fakeFetch(routes);
  const server = new McpServer({ api: new BrasilApi({ fetch: fetch.impl, cacheTtlMs: 0 }), now: () => now });
  return { server, calls: fetch.calls };
}

let nextId = 1;

/** Chama uma ferramenta e devolve { isError, text, data } já decodificados. */
export async function callTool(server: McpServer, name: string, args: Record<string, unknown> = {}) {
  const response = await server.handle({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } });
  if (!response || !("result" in response)) throw new Error(`Resposta inesperada: ${JSON.stringify(response)}`);
  const result = response.result as { content: Array<{ text: string }>; isError?: boolean };
  const text = result.content[0]!.text;
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  return { isError: result.isError === true, text, data };
}
