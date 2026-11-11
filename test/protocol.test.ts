import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";
import { ErrorCode, McpServer, SERVER_NAME, serveStdio } from "../src/server.js";
import { allTools } from "../src/tools/index.js";
import { makeServer } from "./helpers.js";

describe("protocolo MCP", () => {
  it("initialize negocia a versão pedida pelo cliente", async () => {
    const { server } = makeServer();
    const res = await server.handle({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "teste", version: "1" } },
    });
    assert.ok(res && "result" in res);
    const result = res.result as any;
    assert.equal(result.protocolVersion, "2025-03-26");
    assert.equal(result.serverInfo.name, SERVER_NAME);
    assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
  });

  it("initialize cai para a versão mais recente se a pedida não for suportada", async () => {
    const { server } = makeServer();
    const res = await server.handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } });
    assert.equal((res as any).result.protocolVersion, "2025-06-18");
  });

  it("notificações não recebem resposta", async () => {
    const { server } = makeServer();
    assert.equal(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);
  });

  it("ping responde objeto vazio", async () => {
    const { server } = makeServer();
    assert.deepEqual(await server.handle({ jsonrpc: "2.0", id: "a", method: "ping" }), { jsonrpc: "2.0", id: "a", result: {} });
  });

  it("tools/list expõe todas as ferramentas com schema e anotações", async () => {
    const { server } = makeServer();
    const res = (await server.handle({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as any;
    const tools = res.result.tools;
    assert.equal(tools.length, allTools.length);
    for (const tool of tools) {
      assert.match(tool.name, /^[a-z_]+$/);
      assert.ok(tool.description.length > 20, `${tool.name} precisa de uma descrição útil`);
      assert.equal(tool.inputSchema.type, "object");
      assert.equal(tool.annotations.readOnlyHint, true);
    }
    assert.equal(new Set(tools.map((t: any) => t.name)).size, tools.length, "nomes duplicados");
  });

  it("método desconhecido retorna -32601", async () => {
    const { server } = makeServer();
    const res = (await server.handle({ jsonrpc: "2.0", id: 3, method: "resources/list" })) as any;
    assert.equal(res.error.code, ErrorCode.MethodNotFound);
  });

  it("ferramenta desconhecida retorna -32602", async () => {
    const { server } = makeServer();
    const res = (await server.handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nao_existe" } })) as any;
    assert.equal(res.error.code, ErrorCode.InvalidParams);
  });

  it("argumentos inválidos viram isError, não erro de protocolo", async () => {
    const { server } = makeServer();
    const res = (await server.handle({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "consultar_cep", arguments: {} },
    })) as any;
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /obrigatório.*cep/);
  });

  it("mensagem sem jsonrpc retorna -32600", async () => {
    const { server } = makeServer();
    const res = (await server.handle({ id: 1, method: "ping" })) as any;
    assert.equal(res.error.code, ErrorCode.InvalidRequest);
  });
});

describe("transporte stdio", () => {
  it("responde linha a linha e trata JSON inválido", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    serveStdio(new McpServer(), input, output);

    const lines: any[] = [];
    output.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) lines.push(JSON.parse(line));
    });

    input.write('{"jsonrpc":"2.0","id":1,"method":"ping"}\n');
    input.write("isto não é json\n");
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    await new Promise((r) => setTimeout(r, 50));

    // JSON-RPC não garante a ordem das respostas; a notificação não gera resposta.
    assert.equal(lines.length, 2);
    assert.deepEqual(lines.find((l) => l.id === 1), { jsonrpc: "2.0", id: 1, result: {} });
    assert.deepEqual(lines.find((l) => l.id === null), {
      jsonrpc: "2.0",
      id: null,
      error: { code: ErrorCode.ParseError, message: "JSON inválido." },
    });
  });

  it("o binário sobe, faz o handshake e chama uma ferramenta local", async () => {
    const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], { stdio: ["pipe", "pipe", "pipe"] });
    const responses: any[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n").filter(Boolean)) responses.push(JSON.parse(line));
    });

    const send = (msg: unknown) => child.stdin.write(`${JSON.stringify(msg)}\n`);
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "validar_documento", arguments: { documento: "12.ABC.345/01DE-35" } } });

    const deadline = Date.now() + 10_000;
    while (responses.length < 2 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    child.kill();

    assert.equal(responses[0].result.serverInfo.name, SERVER_NAME);
    const data = JSON.parse(responses[1].result.content[0].text);
    assert.deepEqual(data, { tipo: "cnpj", valido: true, formatado: "12.ABC.345/01DE-35", alfanumerico: true });
  });
});
