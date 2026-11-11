import { fail, json, REMOTE, type Tool } from "./types.js";

interface Bank {
  ispb: string;
  name: string | null;
  code: number | null;
  fullName: string | null;
}

export const buscarBanco: Tool = {
  name: "buscar_banco",
  title: "Buscar banco",
  description:
    "Procura bancos e instituições de pagamento pelo código COMPE (ex.: 260) ou por parte do nome (ex.: nubank). Retorna código, ISPB e nome completo.",
  inputSchema: {
    type: "object",
    properties: {
      busca: { type: "string", description: "Código do banco ou trecho do nome", minLength: 1 },
      limite: { type: "integer", description: "Máximo de resultados (padrão: 10)", minimum: 1, maximum: 50 },
    },
    required: ["busca"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const busca = String(args.busca).trim();
    const limite = (args.limite as number | undefined) ?? 10;
    const banks = await api.get<Bank[]>("/banks/v1");

    const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const isCode = /^\d+$/.test(busca);
    const term = fold(busca);

    const matches = banks.filter((b) =>
      isCode
        ? b.code === Number(busca) || b.ispb === busca.padStart(8, "0")
        : fold(`${b.name ?? ""} ${b.fullName ?? ""}`).includes(term),
    );

    if (matches.length === 0) return fail(`Nenhum banco encontrado para "${busca}".`);
    return json({
      total: matches.length,
      resultados: matches.slice(0, limite).map((b) => ({ codigo: b.code, ispb: b.ispb, nome: b.name, nome_completo: b.fullName })),
    });
  },
};

export const consultarTaxas: Tool = {
  name: "consultar_taxas",
  title: "Consultar taxas (Selic, CDI, IPCA)",
  description: "Retorna o valor atual das taxas de referência (Selic, CDI e IPCA, em % ao ano). Sem sigla, retorna todas.",
  inputSchema: {
    type: "object",
    properties: { sigla: { type: "string", enum: ["SELIC", "CDI", "IPCA"], description: "Taxa específica (opcional)" } },
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const sigla = typeof args.sigla === "string" ? args.sigla : undefined;
    return json(await api.get(sigla ? `/taxas/v1/${sigla}` : "/taxas/v1"));
  },
};

const TIPOS_VEICULO = ["carros", "motos", "caminhoes"] as const;

export const fipeMarcas: Tool = {
  name: "fipe_marcas",
  title: "Listar marcas na Tabela FIPE",
  description: "Lista as marcas de veículos da Tabela FIPE por tipo (carros, motos ou caminhões). Aceita filtro por nome.",
  inputSchema: {
    type: "object",
    properties: {
      tipo: { type: "string", enum: TIPOS_VEICULO, description: "Tipo de veículo" },
      busca: { type: "string", description: "Trecho do nome da marca (opcional)" },
    },
    required: ["tipo"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const data = await api.get<Array<{ nome: string; valor: string }>>(`/fipe/marcas/v1/${String(args.tipo)}`);
    const busca = typeof args.busca === "string" ? args.busca.toLowerCase() : "";
    const marcas = (busca ? data.filter((m) => m.nome.toLowerCase().includes(busca)) : data).map((m) => ({
      nome: m.nome,
      codigo: m.valor,
    }));
    return json({ tipo: args.tipo, total: marcas.length, marcas });
  },
};

export const fipePreco: Tool = {
  name: "fipe_preco",
  title: "Preço na Tabela FIPE",
  description:
    "Consulta o preço médio de um veículo na Tabela FIPE pelo código FIPE (ex.: 001004-9), em todos os anos-modelo disponíveis.",
  inputSchema: {
    type: "object",
    properties: {
      codigo_fipe: { type: "string", description: "Código FIPE no formato 000000-0", pattern: "^\\d{6}-?\\d$" },
      ano_modelo: { type: "integer", description: "Filtra por ano-modelo (opcional)", minimum: 1900, maximum: 32000 },
    },
    required: ["codigo_fipe"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const raw = String(args.codigo_fipe).replace("-", "");
    const codigo = `${raw.slice(0, 6)}-${raw.slice(6)}`;
    const data = await api.get<Array<Record<string, unknown>>>(`/fipe/preco/v1/${codigo}`);
    const ano = args.ano_modelo as number | undefined;
    const precos = ano === undefined ? data : data.filter((p) => Number(p.anoModelo) === ano);
    if (precos.length === 0) return fail(`Nenhum preço encontrado para ${codigo}${ano ? ` no ano-modelo ${ano}` : ""}.`);
    return json(precos);
  },
};
