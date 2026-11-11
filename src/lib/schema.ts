/**
 * Subconjunto pequeno de JSON Schema: o suficiente para descrever e validar os argumentos das ferramentas
 * sem depender de bibliotecas externas.
 */

export type PropertySchema =
  | { type: "string"; description?: string; enum?: readonly string[]; pattern?: string; minLength?: number; maxLength?: number }
  | { type: "integer" | "number"; description?: string; minimum?: number; maximum?: number }
  | { type: "boolean"; description?: string };

export interface ObjectSchema {
  type: "object";
  properties: Record<string, PropertySchema>;
  required?: readonly string[];
  additionalProperties?: false;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateArgs(schema: ObjectSchema, input: unknown): Record<string, unknown> {
  const args = input ?? {};
  if (typeof args !== "object" || Array.isArray(args)) {
    throw new ValidationError("Os argumentos devem ser um objeto.");
  }
  const record = args as Record<string, unknown>;

  for (const key of schema.required ?? []) {
    if (record[key] === undefined || record[key] === null || record[key] === "") {
      throw new ValidationError(`Parâmetro obrigatório ausente: "${key}".`);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    const prop = schema.properties[key];
    if (!prop) {
      if (schema.additionalProperties === false) throw new ValidationError(`Parâmetro desconhecido: "${key}".`);
      continue;
    }
    if (value === undefined || value === null) continue;

    switch (prop.type) {
      case "string": {
        if (typeof value !== "string") throw new ValidationError(`"${key}" deve ser texto.`);
        if (prop.enum && !prop.enum.includes(value)) {
          throw new ValidationError(`"${key}" deve ser um destes valores: ${prop.enum.join(", ")}.`);
        }
        if (prop.minLength !== undefined && value.length < prop.minLength) {
          throw new ValidationError(`"${key}" deve ter pelo menos ${prop.minLength} caracteres.`);
        }
        if (prop.maxLength !== undefined && value.length > prop.maxLength) {
          throw new ValidationError(`"${key}" deve ter no máximo ${prop.maxLength} caracteres.`);
        }
        if (prop.pattern && !new RegExp(prop.pattern).test(value)) {
          throw new ValidationError(`"${key}" está em formato inválido.`);
        }
        break;
      }
      case "integer":
      case "number": {
        if (typeof value !== "number" || Number.isNaN(value)) throw new ValidationError(`"${key}" deve ser um número.`);
        if (prop.type === "integer" && !Number.isInteger(value)) throw new ValidationError(`"${key}" deve ser um inteiro.`);
        if (prop.minimum !== undefined && value < prop.minimum) throw new ValidationError(`"${key}" deve ser ≥ ${prop.minimum}.`);
        if (prop.maximum !== undefined && value > prop.maximum) throw new ValidationError(`"${key}" deve ser ≤ ${prop.maximum}.`);
        break;
      }
      case "boolean":
        if (typeof value !== "boolean") throw new ValidationError(`"${key}" deve ser true ou false.`);
        break;
    }
  }

  return record;
}
