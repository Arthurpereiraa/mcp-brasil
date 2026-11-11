import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCnpj, formatCpf, isValidCnpj, isValidCpf, normalizeCep, validateDocument } from "../src/lib/validators.js";

describe("CPF", () => {
  it("aceita CPFs válidos com e sem pontuação", () => {
    assert.equal(isValidCpf("529.982.247-25"), true);
    assert.equal(isValidCpf("52998224725"), true);
  });

  it("rejeita dígito verificador errado, tamanho errado e sequências repetidas", () => {
    assert.equal(isValidCpf("529.982.247-24"), false);
    assert.equal(isValidCpf("5299822472"), false);
    assert.equal(isValidCpf("111.111.111-11"), false);
  });

  it("formata", () => assert.equal(formatCpf("52998224725"), "529.982.247-25"));
});

describe("CNPJ numérico", () => {
  it("aceita CNPJs válidos", () => {
    assert.equal(isValidCnpj("11.222.333/0001-81"), true);
    assert.equal(isValidCnpj("00000000000191"), true); // Banco do Brasil
  });

  it("rejeita inválidos", () => {
    assert.equal(isValidCnpj("11.222.333/0001-82"), false);
    assert.equal(isValidCnpj("00.000.000/0000-00"), false);
    assert.equal(isValidCnpj("1122233300018"), false);
  });

  it("formata", () => assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81"));
});

describe("CNPJ alfanumérico (2026)", () => {
  it("aceita o exemplo oficial da Receita Federal", () => {
    assert.equal(isValidCnpj("12.ABC.345/01DE-35"), true);
    assert.equal(isValidCnpj("12abc34501de35"), true, "aceita minúsculas");
  });

  it("rejeita DV errado e letras nos dígitos verificadores", () => {
    assert.equal(isValidCnpj("12.ABC.345/01DE-36"), false);
    assert.equal(isValidCnpj("12.ABC.345/01DE-3A"), false);
  });

  it("formata", () => assert.equal(formatCnpj("12abc34501de35"), "12.ABC.345/01DE-35"));
});

describe("validateDocument", () => {
  it("detecta o tipo pelo tamanho", () => {
    assert.deepEqual(validateDocument("52998224725"), { tipo: "cpf", valido: true, formatado: "529.982.247-25" });
    assert.equal(validateDocument("11222333000181").tipo, "cnpj");
    assert.equal(validateDocument("12ABC34501DE35").alfanumerico, true);
  });

  it("explica o motivo quando o tamanho não bate", () => {
    const r = validateDocument("123");
    assert.equal(r.tipo, "desconhecido");
    assert.match(r.motivo!, /11 dígitos/);
  });

  it("respeita o tipo forçado", () => {
    assert.equal(validateDocument("52998224725", "cnpj").valido, false);
  });
});

describe("CEP", () => {
  it("normaliza", () => {
    assert.equal(normalizeCep("01310-100"), "01310100");
    assert.equal(normalizeCep("0131010"), null);
  });
});
