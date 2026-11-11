/**
 * Validadores de documentos brasileiros (offline, sem rede).
 *
 * Suporta o CNPJ alfanumérico (IN RFB nº 2.229/2024), em vigor desde julho de 2026:
 * as 12 primeiras posições podem ter letras e números; os 2 dígitos verificadores
 * continuam numéricos. Cada caractere vale (código ASCII − 48), então "0"–"9"
 * valem 0–9 e "A"–"Z" valem 17–42.
 */

export const onlyDigits = (value: string): string => value.replace(/\D/g, "");

/** Remove a pontuação e põe em maiúsculas (para o CNPJ alfanumérico). */
export const normalizeCnpj = (value: string): string =>
  value.toUpperCase().replace(/[^0-9A-Z]/g, "");

const allSameChar = (value: string): boolean => /^(.)\1*$/.test(value);

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11 || allSameChar(cpf)) return false;

  const digit = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

const CNPJ_WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function cnpjCheckDigit(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += (base.charCodeAt(i) - 48) * weights[i]!;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCnpj(input: string): boolean {
  const cnpj = normalizeCnpj(input);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || allSameChar(cnpj)) return false;

  const d1 = cnpjCheckDigit(cnpj, CNPJ_WEIGHTS_1);
  const d2 = cnpjCheckDigit(cnpj.slice(0, 12) + d1, CNPJ_WEIGHTS_2);
  return cnpj.endsWith(`${d1}${d2}`);
}

/** Retorna true se o CNPJ tiver letras (formato alfanumérico novo). */
export const isAlphanumericCnpj = (input: string): boolean => /[A-Z]/.test(normalizeCnpj(input));

export const formatCpf = (input: string): string =>
  onlyDigits(input).replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

export const formatCnpj = (input: string): string =>
  normalizeCnpj(input).replace(
    /^([0-9A-Z]{2})([0-9A-Z]{3})([0-9A-Z]{3})([0-9A-Z]{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );

export function normalizeCep(input: string): string | null {
  const cep = onlyDigits(input);
  return cep.length === 8 ? cep : null;
}

export type DocumentType = "cpf" | "cnpj";

export interface DocumentValidation {
  tipo: DocumentType | "desconhecido";
  valido: boolean;
  formatado: string | null;
  alfanumerico?: boolean;
  motivo?: string;
}

export function validateDocument(input: string, tipo: DocumentType | "auto" = "auto"): DocumentValidation {
  const normalized = normalizeCnpj(input);
  const detected: DocumentType | null =
    tipo !== "auto" ? tipo : normalized.length === 11 && /^\d+$/.test(normalized) ? "cpf" : normalized.length === 14 ? "cnpj" : null;

  if (!detected) {
    return {
      tipo: "desconhecido",
      valido: false,
      formatado: null,
      motivo: `Tamanho inválido (${normalized.length} caracteres): um CPF tem 11 dígitos e um CNPJ tem 14 caracteres.`,
    };
  }

  if (detected === "cpf") {
    const valido = isValidCpf(input);
    return {
      tipo: "cpf",
      valido,
      formatado: valido ? formatCpf(input) : null,
      ...(valido ? {} : { motivo: "Os dígitos verificadores não conferem." }),
    };
  }

  const valido = isValidCnpj(input);
  return {
    tipo: "cnpj",
    valido,
    formatado: valido ? formatCnpj(input) : null,
    alfanumerico: isAlphanumericCnpj(input),
    ...(valido ? {} : { motivo: "Os dígitos verificadores não conferem ou o formato é inválido." }),
  };
}
