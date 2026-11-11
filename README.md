# 🇧🇷 mcp-brasil

[![CI](https://github.com/SEU_USUARIO/mcp-brasil/actions/workflows/ci.yml/badge.svg)](https://github.com/SEU_USUARIO/mcp-brasil/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-brasil)](https://www.npmjs.com/package/mcp-brasil)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![zero dependências](https://img.shields.io/badge/dependências-0-blue)

**Servidor [MCP](https://modelcontextprotocol.io) que dá ao Claude, ao Cursor e a qualquer agente de IA acesso a dados públicos do Brasil:** CEP, CNPJ, bancos, feriados, dias úteis, Tabela FIPE, DDD, Selic/CDI/IPCA, municípios do IBGE, domínios .br e ISBN.

Os dados vêm da [BrasilAPI](https://brasilapi.com.br). O projeto não usa nenhuma dependência de runtime, implementa o protocolo diretamente e valida o **CNPJ alfanumérico** que a Receita Federal adotou em 2026.

```
Você: Quantos dias úteis tenho entre hoje e o Natal? E a empresa 00.000.000/0001-91 está ativa?

Claude: → calcular_dias_uteis(2026-11-11, 2026-12-25)
        → consultar_cnpj(00000000000191)
        São 31 dias úteis (descontei 20/11 e 25/12). O Banco do Brasil S.A. está com situação ATIVA desde...
```

## Ferramentas

| Ferramenta | O que faz | Internet |
|---|---|:---:|
| `consultar_cep` | Endereço completo de um CEP, com coordenadas quando houver | ✅ |
| `consultar_cnpj` | Razão social, situação, CNAE, porte, Simples/MEI e sócios | ✅ |
| `validar_documento` | Valida CPF/CNPJ (inclusive o alfanumérico) e formata | — |
| `buscar_banco` | Banco por código COMPE ou nome (ignora acentos) | ✅ |
| `consultar_taxas` | Selic, CDI e IPCA atuais | ✅ |
| `feriados_nacionais` | Feriados do ano com o dia da semana | ✅ |
| `calcular_dias_uteis` | Dias úteis entre duas datas, descontando feriados nacionais | ✅ |
| `consultar_ddd` | UF e cidades de um DDD | ✅ |
| `listar_municipios` | Municípios de uma UF com o código IBGE | ✅ |
| `fipe_marcas` | Marcas de carros, motos e caminhões | ✅ |
| `fipe_preco` | Preço FIPE por código e ano-modelo | ✅ |
| `consultar_dominio_br` | Disponibilidade de domínio .br no Registro.br | ✅ |
| `consultar_isbn` | Dados de um livro pelo ISBN | ✅ |

Todas as ferramentas são somente leitura e trazem as [anotações](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) `readOnlyHint` e `openWorldHint`. Por isso, os clientes podem aprová-las sem pedir confirmação a cada chamada.

## Instalação

Precisa de Node.js 20 ou mais recente.

### Claude Code

```bash
claude mcp add brasil -- npx -y mcp-brasil
```

### Claude Desktop

Adicione ao `claude_desktop_config.json` (em **Settings → Developer → Edit Config**):

```json
{
  "mcpServers": {
    "brasil": {
      "command": "npx",
      "args": ["-y", "mcp-brasil"]
    }
  }
}
```

### Cursor / Windsurf / VS Code

Use a mesma configuração acima em `.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json` ou `.vscode/mcp.json` (no VS Code, a chave é `servers`).

## Configuração

| Variável | Padrão | Descrição |
|---|---|---|
| `BRASILAPI_BASE_URL` | `https://brasilapi.com.br/api` | Para usar um espelho ou uma instância própria |
| `BRASILAPI_TIMEOUT_MS` | `15000` | Timeout por requisição |
| `BRASILAPI_CACHE_TTL_MS` | `300000` | Cache em memória (5 min); `0` desativa |

## Exemplos de prompts

- "Valide esses CNPJs e me diga quais estão ativos: …"
- "Qual o prazo de 15 dias úteis a partir de 18/12/2026?"
- "Quanto vale um Gol 2012 na FIPE?"
- "Qual banco é o 077 e qual o ISPB dele?"
- "O domínio padariadojoao.com.br está livre?"
- "Monte uma tabela com os feriados de 2027 que caem em dia de semana."

## Arquitetura

```
src/
├── index.ts          # CLI: lê variáveis de ambiente e liga o servidor ao stdio
├── server.ts         # MCP sobre JSON-RPC 2.0: initialize, ping, tools/list, tools/call
├── lib/
│   ├── brasilapi.ts  # fetch com timeout, cache TTL e mensagens de erro em português
│   ├── schema.ts     # subconjunto de JSON Schema: descreve E valida os argumentos
│   └── validators.ts # CPF, CNPJ (numérico e alfanumérico) e CEP, offline
└── tools/            # uma ferramenta = { name, description, inputSchema, handler }
```

Algumas decisões de projeto:

- **Zero dependências de runtime.** O protocolo stdio do MCP é JSON-RPC com uma mensagem por linha. Implementar isso diretamente dá cerca de 150 linhas e deixa o `npx` instantâneo.
- **Erros de ferramenta voltam com `isError: true`**, e não como erro de protocolo. Assim o modelo lê a mensagem (por exemplo, "CNPJ inválido: confira os dígitos verificadores") e se corrige sozinho.
- **Validação antes da rede.** CEP, CNPJ, datas e domínios malformados são rejeitados sem chamar a API.
- **Respostas enxutas.** `consultar_cnpj` devolve só os campos úteis, para economizar contexto do modelo.

## Desenvolvimento

```bash
npm install
npm test            # 46 testes com node:test, API mockada (roda offline)
npm run typecheck
npm run build
npm run inspector   # abre o MCP Inspector para testar as ferramentas na mão
```

Para adicionar uma ferramenta, crie o objeto `Tool` em `src/tools/`, registre em `src/tools/index.ts` e escreva o teste em `test/tools.test.ts`. O teste `tools/list` já checa nome, descrição e schema de todas.

## Feito com IA

Este projeto foi escrito do início ao fim em pair programming com o [Claude](https://claude.ai), da escolha da arquitetura aos testes. Ele faz parte de uma série de projetos de IA:

- [x] **mcp-brasil**, este servidor MCP
- [ ] Plugin do Claude Code com skills e hooks que usam o mcp-brasil
- [ ] Sistema multiagente sobre os dados públicos brasileiros
- [ ] App 100% vibecodado

## Licença

[MIT](LICENSE). Os dados são da BrasilAPI e das fontes oficiais que ela agrega (Correios, Receita Federal, Banco Central, IBGE, FIPE, Registro.br). Confira os termos de cada fonte.
