import { fail, json, REMOTE, type Tool } from "./types.js";

export const consultarIsbn: Tool = {
  name: "consultar_isbn",
  title: "Consultar livro por ISBN",
  description: "Busca título, autores, editora, ano e sinopse de um livro pelo ISBN-10 ou ISBN-13.",
  inputSchema: {
    type: "object",
    properties: { isbn: { type: "string", description: "ISBN com ou sem hífens" } },
    required: ["isbn"],
    additionalProperties: false,
  },
  annotations: REMOTE,
  async handler(args, { api }) {
    const isbn = String(args.isbn).replace(/[^0-9Xx]/g, "").toUpperCase();
    if (isbn.length !== 10 && isbn.length !== 13) return fail("ISBN inválido: informe 10 ou 13 caracteres.");
    return json(await api.get(`/isbn/v1/${isbn}`));
  },
};
