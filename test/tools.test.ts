import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BrasilApi } from "../src/lib/brasilapi.js";
import { callTool, fakeFetch, makeServer } from "./helpers.js";

const FERIADOS_2026 = [
  { date: "2026-01-01", name: "Confraternização mundial", type: "national" },
  { date: "2026-02-17", name: "Carnaval", type: "national" },
  { date: "2026-04-03", name: "Sexta-feira Santa", type: "national" },
  { date: "2026-04-21", name: "Tiradentes", type: "national" },
  { date: "2026-11-15", name: "Proclamação da República", type: "national" },
  { date: "2026-11-20", name: "Dia da consciência negra", type: "national" },
  { date: "2026-12-25", name: "Natal", type: "national" },
];
const FERIADOS_2027 = [{ date: "2027-01-01", name: "Confraternização mundial", type: "national" }];

describe("consultar_cep", () => {
  it("normaliza o CEP e repassa a resposta", async () => {
    const body = { cep: "01310100", state: "SP", city: "São Paulo", street: "Avenida Paulista" };
    const { server, calls } = makeServer({ "/cep/v2/01310100": body });
    const r = await callTool(server, "consultar_cep", { cep: "01310-100" });
    assert.equal(r.isError, false);
    assert.deepEqual(r.data, body);
    assert.equal(calls.length, 1);
  });

  it("rejeita CEP malformado sem chamar a API", async () => {
    const { server, calls } = makeServer();
    const r = await callTool(server, "consultar_cep", { cep: "123" });
    assert.equal(r.isError, true);
    assert.equal(calls.length, 0);
  });

  it("propaga a mensagem de erro da BrasilAPI", async () => {
    const { server } = makeServer({
      "/cep/v2/99999999": () => ({ status: 404, body: { message: "Todos os serviços de CEP retornaram erro." } }),
    });
    const r = await callTool(server, "consultar_cep", { cep: "99999-999" });
    assert.equal(r.isError, true);
    assert.equal(r.text, "Todos os serviços de CEP retornaram erro.");
  });
});

describe("consultar_cnpj", () => {
  const body = {
    cnpj: "00000000000191",
    razao_social: "BANCO DO BRASIL SA",
    nome_fantasia: "",
    descricao_situacao_cadastral: "ATIVA",
    uf: "DF",
    campo_irrelevante: "x",
    qsa: [{ nome_socio: "FULANO", qualificacao_socio: "Presidente", identificador_de_socio: 2 }],
    cnaes_secundarios: [{ codigo: 6422100, descricao: "Bancos múltiplos" }],
  };

  it("enxuga a resposta e formata o CNPJ", async () => {
    const { server } = makeServer({ "/cnpj/v1/00000000000191": body });
    const r = await callTool(server, "consultar_cnpj", { cnpj: "00.000.000/0001-91" });
    assert.equal(r.data.razao_social, "BANCO DO BRASIL SA");
    assert.equal(r.data.cnpj_formatado, "00.000.000/0001-91");
    assert.equal(r.data.nome_fantasia, undefined, "campos vazios são omitidos");
    assert.equal(r.data.campo_irrelevante, undefined);
    assert.deepEqual(r.data.socios, [{ nome_socio: "FULANO", qualificacao_socio: "Presidente" }]);
    assert.equal(r.data.cnaes_secundarios, undefined);
  });

  it("inclui CNAEs secundários quando pedido", async () => {
    const { server } = makeServer({ "/cnpj/v1/00000000000191": body });
    const r = await callTool(server, "consultar_cnpj", { cnpj: "00000000000191", incluir_cnaes_secundarios: true });
    assert.equal(r.data.cnaes_secundarios.length, 1);
  });

  it("não consulta a API com CNPJ inválido", async () => {
    const { server, calls } = makeServer();
    const r = await callTool(server, "consultar_cnpj", { cnpj: "00.000.000/0001-90" });
    assert.equal(r.isError, true);
    assert.equal(calls.length, 0);
  });
});

describe("buscar_banco", () => {
  const banks = [
    { ispb: "00000000", name: "BCO DO BRASIL S.A.", code: 1, fullName: "Banco do Brasil S.A." },
    { ispb: "18236120", name: "NU PAGAMENTOS - IP", code: 260, fullName: "NU PAGAMENTOS S.A. - INSTITUIÇÃO DE PAGAMENTO" },
    { ispb: "60701190", name: "ITAÚ UNIBANCO S.A.", code: 341, fullName: "ITAÚ UNIBANCO S.A." },
  ];

  it("busca por código", async () => {
    const { server } = makeServer({ "/banks/v1": banks });
    const r = await callTool(server, "buscar_banco", { busca: "260" });
    assert.equal(r.data.resultados[0].nome, "NU PAGAMENTOS - IP");
  });

  it("encontra pela marca mesmo quando a razão social é outra (nubank → NU PAGAMENTOS)", async () => {
    const { server } = makeServer({ "/banks/v1": banks });
    const r = await callTool(server, "buscar_banco", { busca: "Nubank" });
    assert.equal(r.isError, false);
    assert.equal(r.data.resultados[0].codigo, 260);
  });

  it("o apelido aparece primeiro quando também há ocorrências pelo nome", async () => {
    const { server } = makeServer({ "/banks/v1": banks });
    const r = await callTool(server, "buscar_banco", { busca: "banco do brasil" });
    assert.equal(r.data.resultados[0].codigo, 1);
  });

  it("busca por nome ignorando acentos e caixa", async () => {
    const { server } = makeServer({ "/banks/v1": banks });
    const r = await callTool(server, "buscar_banco", { busca: "itau" });
    assert.equal(r.data.total, 1);
    assert.equal(r.data.resultados[0].codigo, 341);
  });

  it("retorna isError quando nada bate", async () => {
    const { server } = makeServer({ "/banks/v1": banks });
    assert.equal((await callTool(server, "buscar_banco", { busca: "banco inexistente" })).isError, true);
  });
});

describe("calcular_dias_uteis", () => {
  it("desconta fins de semana e feriados em dia útil", async () => {
    const { server } = makeServer({ "/feriados/v1/2026": FERIADOS_2026 });
    // Novembro/2026: 30 dias, 9 dias de fim de semana; 15/11 cai num domingo e 20/11 numa sexta.
    const r = await callTool(server, "calcular_dias_uteis", { data_inicio: "2026-11-01", data_fim: "2026-11-30" });
    assert.deepEqual(r.data, {
      data_inicio: "2026-11-01",
      data_fim: "2026-11-30",
      dias_corridos: 30,
      dias_uteis: 20,
      dias_fim_de_semana: 9,
      feriados_em_dia_util: [{ data: "2026-11-20", nome: "Dia da consciência negra" }],
    });
  });

  it("busca os feriados de cada ano do intervalo", async () => {
    const { server, calls } = makeServer({ "/feriados/v1/2026": FERIADOS_2026, "/feriados/v1/2027": FERIADOS_2027 });
    const r = await callTool(server, "calcular_dias_uteis", { data_inicio: "2026-12-24", data_fim: "2027-01-04" });
    // 24 (qui), 28, 29, 30, 31, 04 = 6 úteis; 25/12 e 01/01 são feriados em sexta.
    assert.equal(r.data.dias_uteis, 6);
    assert.equal(r.data.feriados_em_dia_util.length, 2);
    assert.equal(calls.length, 2);
  });

  it("rejeita datas inexistentes e intervalos invertidos", async () => {
    const { server } = makeServer();
    assert.equal((await callTool(server, "calcular_dias_uteis", { data_inicio: "2026-02-30", data_fim: "2026-03-01" })).isError, true);
    assert.equal((await callTool(server, "calcular_dias_uteis", { data_inicio: "2026-03-02", data_fim: "2026-03-01" })).isError, true);
  });
});

describe("feriados_nacionais", () => {
  it("adiciona o dia da semana e filtra os próximos", async () => {
    const { server } = makeServer({ "/feriados/v1/2026": FERIADOS_2026 });
    const r = await callTool(server, "feriados_nacionais", { apenas_proximos: true });
    assert.deepEqual(r.data.map((f: any) => f.data), ["2026-11-15", "2026-11-20", "2026-12-25"]);
    assert.equal(r.data[0].dia_semana, "domingo");
    assert.equal(r.data[1].dia_semana, "sexta-feira");
  });
});

describe("outras ferramentas", () => {
  it("consultar_ddd resume a resposta", async () => {
    const { server } = makeServer({ "/ddd/v1/11": { state: "SP", cities: ["SÃO PAULO", "GUARULHOS"] } });
    const r = await callTool(server, "consultar_ddd", { ddd: "11" });
    assert.deepEqual(r.data, { ddd: "11", uf: "SP", total_cidades: 2, cidades: ["SÃO PAULO", "GUARULHOS"] });
  });

  it("listar_municipios filtra ignorando acentos", async () => {
    const { server } = makeServer({
      "/ibge/municipios/v1/SP": [
        { nome: "SÃO PAULO", codigo_ibge: "3550308" },
        { nome: "SÃO JOSÉ DOS CAMPOS", codigo_ibge: "3549904" },
        { nome: "CAMPINAS", codigo_ibge: "3509502" },
      ],
    });
    const r = await callTool(server, "listar_municipios", { uf: "SP", busca: "sao jose" });
    assert.equal(r.data.total, 1);
  });

  it("listar_municipios valida a UF pelo enum", async () => {
    const { server } = makeServer();
    assert.equal((await callTool(server, "listar_municipios", { uf: "XX" })).isError, true);
  });

  it("fipe_preco normaliza o código e filtra o ano", async () => {
    const { server } = makeServer({
      "/fipe/preco/v1/001004-9": [
        { valor: "R$ 10.000,00", anoModelo: 2010, codigoFipe: "001004-9" },
        { valor: "R$ 12.000,00", anoModelo: 2012, codigoFipe: "001004-9" },
      ],
    });
    const r = await callTool(server, "fipe_preco", { codigo_fipe: "0010049", ano_modelo: 2012 });
    assert.deepEqual(r.data, [{ valor: "R$ 12.000,00", anoModelo: 2012, codigoFipe: "001004-9" }]);
  });

  it("consultar_taxas com e sem sigla", async () => {
    const { server } = makeServer({ "/taxas/v1": [{ nome: "Selic", valor: 15 }], "/taxas/v1/CDI": { nome: "CDI", valor: 14.9 } });
    assert.equal((await callTool(server, "consultar_taxas")).data.length, 1);
    assert.equal((await callTool(server, "consultar_taxas", { sigla: "CDI" })).data.nome, "CDI");
  });

  it("consultar_dominio_br limpa a URL e exige .br", async () => {
    const { server } = makeServer({ "/registrobr/v1/exemplo.com.br": { status: "AVAILABLE", fqdn: "exemplo.com.br" } });
    assert.equal((await callTool(server, "consultar_dominio_br", { dominio: "https://Exemplo.com.br/x" })).data.status, "AVAILABLE");
    assert.equal((await callTool(server, "consultar_dominio_br", { dominio: "exemplo.com" })).isError, true);
  });

  it("consultar_isbn aceita hífens", async () => {
    const { server } = makeServer({ "/isbn/v1/9788545702870": { title: "Akira" } });
    assert.equal((await callTool(server, "consultar_isbn", { isbn: "978-85-457-0287-0" })).data.title, "Akira");
  });
});

describe("BrasilApi", () => {
  it("usa o cache em memória", async () => {
    const fetch = fakeFetch({ "/banks/v1": [] });
    const api = new BrasilApi({ fetch: fetch.impl });
    await api.get("/banks/v1");
    await api.get("/banks/v1");
    assert.equal(fetch.calls.length, 1);
  });

  it("traduz 429 e falhas de rede", async () => {
    const limited = new BrasilApi({ fetch: fakeFetch({ "/x": () => ({ status: 429, body: null }) }).impl, cacheTtlMs: 0 });
    await assert.rejects(limited.get("/x"), /Limite de requisições/);

    const offline = new BrasilApi({ fetch: (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch });
    await assert.rejects(offline.get("/x"), /Falha ao acessar a BrasilAPI: ECONNREFUSED/);
  });
});
