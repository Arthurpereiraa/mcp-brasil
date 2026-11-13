import type { BrasilApi } from "../lib/brasilapi.js";
import { fail, json, REMOTE, type Tool } from "./types.js";

interface Feriado {
  date: string;
  name: string;
  type: string;
}

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Converte "AAAA-MM-DD" em Date UTC, rejeitando datas que não existem (ex.: 2026-02-30). */
export function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function feriadosDoAno(api: BrasilApi, ano: number): Promise<Feriado[]> {
  return api.get<Feriado[]>(`/feriados/v1/${ano}`);
}

export const feriadosNacionais: Tool = {
  name: "feriados_nacionais",
  title: "Feriados nacionais",
  description:
    "Lista os feriados nacionais de um ano (inclui Carnaval, Sexta-feira Santa e Corpus Christi), com o dia da semana de cada um.",
  inputSchema: {
    type: "object",
    properties: {
      ano: { type: "integer", description: "Ano, ex.: 2026 (padrão: ano atual)", minimum: 1900, maximum: 2199 },
      apenas_proximos: { type: "boolean", description: "Só os feriados a partir de hoje (padrão: false)" },
    },
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api, now }) {
    const today = iso(now());
    const ano = (args.ano as number | undefined) ?? now().getUTCFullYear();
    let feriados = await feriadosDoAno(api, ano);
    if (args.apenas_proximos) feriados = feriados.filter((f) => f.date >= today);
    return json(
      feriados.map((f) => ({
        data: f.date,
        nome: f.name,
        tipo: f.type,
        dia_semana: DIAS_SEMANA[parseIsoDate(f.date)?.getUTCDay() ?? 0],
      })),
    );
  },
};

/** Carrega os feriados sob demanda, um ano por vez, e responde se uma data é dia útil. */
function criarCalendario(api: BrasilApi) {
  const anos = new Map<number, Promise<Map<string, string>>>();
  const feriadosDe = (ano: number) => {
    let p = anos.get(ano);
    if (!p) {
      p = feriadosDoAno(api, ano).then((lista) => new Map(lista.map((f) => [f.date, f.name])));
      anos.set(ano, p);
    }
    return p;
  };
  return {
    /** Nome do feriado se a data for feriado nacional em dia de semana; undefined caso contrário. */
    async feriado(d: Date): Promise<string | undefined> {
      return (await feriadosDe(d.getUTCFullYear())).get(iso(d));
    },
    async diaUtil(d: Date): Promise<boolean> {
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) return false;
      return (await this.feriado(d)) === undefined;
    },
  };
}

const proximoDia = (d: Date) => new Date(d.getTime() + 86_400_000);

export const calcularPrazo: Tool = {
  name: "calcular_prazo",
  title: "Calcular prazo / vencimento",
  description:
    "Calcula a data final de um prazo: soma N dias úteis a uma data (pulando fins de semana e feriados nacionais, sem contar o dia inicial) " +
    "ou N dias corridos (prorrogando para o próximo dia útil se cair em fim de semana ou feriado). " +
    "Use para vencimentos, SLAs e prazos contratuais. Não considera feriados estaduais ou municipais.",
  inputSchema: {
    type: "object",
    properties: {
      data_inicio: { type: "string", description: "Data inicial, AAAA-MM-DD (não entra na contagem)", pattern: DATE_PATTERN },
      dias: { type: "integer", description: "Quantidade de dias do prazo", minimum: 1, maximum: 3650 },
      tipo: { type: "string", enum: ["uteis", "corridos"], description: "Dias úteis (padrão) ou corridos" },
    },
    required: ["data_inicio", "dias"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const inicio = parseIsoDate(String(args.data_inicio));
    if (!inicio) return fail("Data inválida: use o formato AAAA-MM-DD com uma data que exista.");
    const dias = args.dias as number;
    const tipo = (args.tipo as "uteis" | "corridos" | undefined) ?? "uteis";
    const cal = criarCalendario(api);

    let fim = inicio;
    let prorrogado = false;
    if (tipo === "uteis") {
      for (let contados = 0; contados < dias; ) {
        fim = proximoDia(fim);
        if (await cal.diaUtil(fim)) contados++;
      }
    } else {
      fim = new Date(inicio.getTime() + dias * 86_400_000);
      while (!(await cal.diaUtil(fim))) {
        fim = proximoDia(fim);
        prorrogado = true;
      }
    }

    const feriados: Array<{ data: string; nome: string }> = [];
    for (let d = proximoDia(inicio); d <= fim; d = proximoDia(d)) {
      const dow = d.getUTCDay();
      const nome = dow !== 0 && dow !== 6 ? await cal.feriado(d) : undefined;
      if (nome) feriados.push({ data: iso(d), nome });
    }

    return json({
      data_inicio: iso(inicio),
      dias,
      tipo,
      data_final: iso(fim),
      dia_semana: DIAS_SEMANA[fim.getUTCDay()],
      ...(tipo === "corridos" ? { prorrogado_para_dia_util: prorrogado } : {}),
      feriados_em_dia_util_no_periodo: feriados,
    });
  },
};

export const calcularDiasUteis: Tool = {
  name: "calcular_dias_uteis",
  title: "Calcular dias úteis",
  description:
    "Conta os dias úteis entre duas datas (inclusive), descontando fins de semana e feriados nacionais. Útil para prazos, SLAs e boletos. Não considera feriados estaduais ou municipais.",
  inputSchema: {
    type: "object",
    properties: {
      data_inicio: { type: "string", description: "Data inicial, AAAA-MM-DD", pattern: DATE_PATTERN },
      data_fim: { type: "string", description: "Data final, AAAA-MM-DD", pattern: DATE_PATTERN },
    },
    required: ["data_inicio", "data_fim"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const inicio = parseIsoDate(String(args.data_inicio));
    const fim = parseIsoDate(String(args.data_fim));
    if (!inicio || !fim) return fail("Data inválida: use o formato AAAA-MM-DD com uma data que exista.");
    if (fim < inicio) return fail("A data final deve ser igual ou posterior à data inicial.");

    const anos: number[] = [];
    for (let a = inicio.getUTCFullYear(); a <= fim.getUTCFullYear(); a++) anos.push(a);
    if (anos.length > 10) return fail("Intervalo muito grande: o máximo é de 10 anos.");

    const lista = (await Promise.all(anos.map((a) => feriadosDoAno(api, a)))).flat();
    const feriados = new Map(lista.map((f) => [f.date, f.name]));

    let uteis = 0;
    let fimDeSemana = 0;
    const feriadosNoPeriodo: Array<{ data: string; nome: string }> = [];

    for (const d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      const dow = d.getUTCDay();
      const key = iso(d);
      if (dow === 0 || dow === 6) fimDeSemana++;
      else if (feriados.has(key)) feriadosNoPeriodo.push({ data: key, nome: feriados.get(key)! });
      else uteis++;
    }

    const total = Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1;
    return json({
      data_inicio: iso(inicio),
      data_fim: iso(fim),
      dias_corridos: total,
      dias_uteis: uteis,
      dias_fim_de_semana: fimDeSemana,
      feriados_em_dia_util: feriadosNoPeriodo,
    });
  },
};
