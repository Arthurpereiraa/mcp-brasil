import { formatCnpj, isValidCnpj, normalizeCnpj, validateDocument } from "../lib/validators.js";
import { fail, json, LOCAL, pick, REMOTE, type Tool } from "./types.js";

const CNPJ_FIELDS = [
  "cnpj", "razao_social", "nome_fantasia", "descricao_situacao_cadastral", "data_situacao_cadastral",
  "data_inicio_atividade", "natureza_juridica", "porte", "capital_social", "cnae_fiscal", "cnae_fiscal_descricao",
  "opcao_pelo_simples", "opcao_pelo_mei", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "cep",
  "ddd_telefone_1", "email",
] as const;

interface CnpjResponse extends Record<string, unknown> {
  qsa?: Array<{ nome_socio?: string; qualificacao_socio?: string; data_entrada_sociedade?: string }>;
  cnaes_secundarios?: Array<{ codigo?: number; descricao?: string }>;
}

export const consultarCnpj: Tool = {
  name: "consultar_cnpj",
  title: "Consultar CNPJ",
  description:
    "Consulta os dados públicos de uma empresa na Receita Federal: razão social, situação cadastral, endereço, CNAE, porte, Simples/MEI e quadro de sócios.",
  inputSchema: {
    type: "object",
    properties: {
      cnpj: { type: "string", description: "CNPJ com ou sem pontuação, ex.: 00.000.000/0001-91" },
      incluir_cnaes_secundarios: { type: "boolean", description: "Inclui a lista de CNAEs secundários (padrão: false)" },
    },
    required: ["cnpj"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const cnpj = normalizeCnpj(String(args.cnpj));
    if (!isValidCnpj(cnpj)) return fail(`CNPJ inválido: ${String(args.cnpj)}. Confira os dígitos verificadores.`);

    const data = await api.get<CnpjResponse>(`/cnpj/v1/${cnpj}`);
    return json({
      ...pick(data, CNPJ_FIELDS),
      cnpj_formatado: formatCnpj(cnpj),
      socios: (data.qsa ?? []).map((s) => pick(s, ["nome_socio", "qualificacao_socio", "data_entrada_sociedade"])),
      ...(args.incluir_cnaes_secundarios ? { cnaes_secundarios: data.cnaes_secundarios ?? [] } : {}),
    });
  },
};

export const validarDocumento: Tool = {
  name: "validar_documento",
  title: "Validar CPF ou CNPJ",
  description:
    "Valida localmente (sem internet) os dígitos verificadores de um CPF ou CNPJ, inclusive o CNPJ alfanumérico em vigor desde 2026, e devolve o número formatado. Não consulta se o documento existe.",
  inputSchema: {
    type: "object",
    properties: {
      documento: { type: "string", description: "CPF ou CNPJ, com ou sem pontuação" },
      tipo: { type: "string", enum: ["auto", "cpf", "cnpj"], description: "Força o tipo; padrão: detecta pelo tamanho" },
    },
    required: ["documento"],
    additionalProperties: false,
  },
  annotations: LOCAL,
  async handler(args) {
    const tipo = (args.tipo as "auto" | "cpf" | "cnpj" | undefined) ?? "auto";
    return json(validateDocument(String(args.documento), tipo));
  },
};

export const consultarDominioBr: Tool = {
  name: "consultar_dominio_br",
  title: "Consultar domínio .br",
  description: "Verifica no Registro.br se um domínio .br está disponível ou registrado (com data de expiração e sugestões).",
  inputSchema: {
    type: "object",
    properties: { dominio: { type: "string", description: "Domínio, ex.: minhaempresa.com.br" } },
    required: ["dominio"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const dominio = String(args.dominio).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.br$/.test(dominio)) return fail("Informe um domínio terminado em .br.");
    return json(await api.get(`/registrobr/v1/${encodeURIComponent(dominio)}`));
  },
};
