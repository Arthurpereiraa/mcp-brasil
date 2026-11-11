import { calcularDiasUteis, feriadosNacionais } from "./calendario.js";
import { consultarCnpj, consultarDominioBr, validarDocumento } from "./empresas.js";
import { consultarCep, consultarDdd, listarMunicipios } from "./enderecos.js";
import { buscarBanco, consultarTaxas, fipeMarcas, fipePreco } from "./financeiro.js";
import { consultarIsbn } from "./outros.js";
import type { Tool } from "./types.js";

export const allTools: readonly Tool[] = [
  consultarCep,
  consultarCnpj,
  validarDocumento,
  buscarBanco,
  consultarTaxas,
  feriadosNacionais,
  calcularDiasUteis,
  consultarDdd,
  listarMunicipios,
  fipeMarcas,
  fipePreco,
  consultarDominioBr,
  consultarIsbn,
];

export type { Tool, ToolContext, ToolResult } from "./types.js";
