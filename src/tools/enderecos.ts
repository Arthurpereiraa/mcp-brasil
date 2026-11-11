import { normalizeCep, onlyDigits } from "../lib/validators.js";
import { fail, json, REMOTE, type Tool } from "./types.js";

const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const consultarCep: Tool = {
  name: "consultar_cep",
  title: "Consultar CEP",
  description:
    "Busca o endereço de um CEP brasileiro (rua, bairro, cidade, UF e, quando houver, coordenadas). Aceita com ou sem hífen.",
  inputSchema: {
    type: "object",
    properties: { cep: { type: "string", description: "CEP com 8 dígitos, ex.: 01310-100" } },
    required: ["cep"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const cep = normalizeCep(String(args.cep));
    if (!cep) return fail("CEP inválido: informe 8 dígitos.");
    return json(await api.get(`/cep/v2/${cep}`));
  },
};

export const consultarDdd: Tool = {
  name: "consultar_ddd",
  title: "Consultar DDD",
  description: "Retorna a UF e a lista de cidades atendidas por um código DDD.",
  inputSchema: {
    type: "object",
    properties: { ddd: { type: "string", description: "Código DDD de 2 dígitos, ex.: 11" } },
    required: ["ddd"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const ddd = onlyDigits(String(args.ddd));
    if (ddd.length !== 2) return fail("DDD inválido: informe 2 dígitos.");
    const data = await api.get<{ state: string; cities: string[] }>(`/ddd/v1/${ddd}`);
    return json({ ddd, uf: data.state, total_cidades: data.cities?.length ?? 0, cidades: data.cities });
  },
};

export const listarMunicipios: Tool = {
  name: "listar_municipios",
  title: "Listar municípios de uma UF",
  description: "Lista os municípios de um estado com o código IBGE de cada um. Aceita filtro por nome.",
  inputSchema: {
    type: "object",
    properties: {
      uf: { type: "string", description: "Sigla do estado, ex.: MG", enum: UFS },
      busca: { type: "string", description: "Trecho do nome para filtrar (opcional, ignora acentos)" },
    },
    required: ["uf"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const uf = String(args.uf).toUpperCase();
    const data = await api.get<Array<{ nome: string; codigo_ibge: string }>>(`/ibge/municipios/v1/${uf}`);
    const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const busca = typeof args.busca === "string" ? fold(args.busca) : "";
    const municipios = busca ? data.filter((m) => fold(m.nome).includes(busca)) : data;
    return json({ uf, total: municipios.length, municipios });
  },
};
