# Changelog

## [Não lançado]

### Alterado
- CI usa `npm ci` com cache agora que o projeto tem `package-lock.json`.
- Release publica no npm via trusted publishing (OIDC), sem token salvo no GitHub, e pula a publicação se a versão já existir.
- `buscar_banco` reconhece nomes de marca (Nubank, Inter, C6, PicPay...).

## [0.1.0] - 2026-11-11

### Adicionado
- Servidor MCP via stdio, sem dependências de runtime, compatível com os protocolos 2024-11-05, 2025-03-26 e 2025-06-18.
- 13 ferramentas: CEP, CNPJ, validação de CPF/CNPJ, bancos, taxas, feriados, dias úteis, DDD, municípios IBGE, FIPE (marcas e preço), domínio .br e ISBN.
- Suporte ao CNPJ alfanumérico (IN RFB nº 2.229/2024).
- Cache em memória, timeout configurável e mensagens de erro em português.
