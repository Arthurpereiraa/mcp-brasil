#!/usr/bin/env node
import { BrasilApi } from "./lib/brasilapi.js";
import { McpServer, SERVER_NAME, SERVER_VERSION, serveStdio } from "./server.js";

const arg = process.argv[2];
if (arg === "--version" || arg === "-v") {
  console.log(SERVER_VERSION);
  process.exit(0);
}
if (arg === "--help" || arg === "-h") {
  console.log(`${SERVER_NAME} ${SERVER_VERSION}: servidor MCP (stdio) com dados públicos do Brasil.

Uso: npx -y mcp-brasil

Variáveis de ambiente:
  BRASILAPI_BASE_URL    URL base da API (padrão: https://brasilapi.com.br/api)
  BRASILAPI_TIMEOUT_MS  Timeout por requisição em ms (padrão: 15000)
  BRASILAPI_CACHE_TTL_MS  TTL do cache em memória em ms; 0 desativa (padrão: 300000)`);
  process.exit(0);
}

const numberEnv = (name: string): number | undefined => {
  const value = process.env[name];
  return value && !Number.isNaN(Number(value)) ? Number(value) : undefined;
};

const api = new BrasilApi({
  baseUrl: process.env.BRASILAPI_BASE_URL,
  timeoutMs: numberEnv("BRASILAPI_TIMEOUT_MS"),
  cacheTtlMs: numberEnv("BRASILAPI_CACHE_TTL_MS"),
});

const server = new McpServer({ api, log: (m) => console.error(`[${SERVER_NAME}] ${m}`) });
serveStdio(server);
console.error(`[${SERVER_NAME}] v${SERVER_VERSION} pronto (stdio)`);
