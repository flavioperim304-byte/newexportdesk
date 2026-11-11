# Export Desk — novo build

Projeto de inteligência comercial para prospecção de compradores de exportação. Esta versão está sendo construída a partir de uma auditoria do repositório anterior, mas não preserva funcionalidades apenas por existirem.

## Etapa 1 — Descoberta (implementada nesta versão)

1. **ICP estruturado por fornecedor:** LQ Professional e Kanechom são executados separadamente. Os campos estruturados permanecem visíveis e armazenados separadamente do prompt livre.
2. **Exa Agent:** uma tarefa por país e por perfil de comprador. Limite de até 10 empresas por país e por perfil; uma busca complementar pode ser executada para o mesmo perfil. A quantidade não é preenchida artificialmente.
3. **Critérios de entrada:** identidade identificável, evidência de operação comercial no país e pelo menos uma evidência pública, com URL e trecho, de atividade na categoria relevante. O perfil pesquisado é armazenado separadamente do papel comercial real. O campo de papel só é confirmado com evidência própria; caso contrário fica indicado ou desconhecido para investigação posterior. Não é necessário provar importação nesta fase.
4. **Evidências visíveis:** cada lead guarda os trechos e links que justificaram sua entrada na descoberta.
5. **Exclusões e conflitos:** exclusões estruturadas são respeitadas. Contradições explícitas entre buyer types/exclusões e o prompt livre são mostradas e bloqueiam a execução até correção. Os campos estruturados são mantidos visíveis no formulário, inclusive no modo compacto.
6. **Âncoras opcionais:** só entram quando ativadas pelo usuário. Servem como referências de perfil/canal e não geram pontos nem comprovam intenção de compra.
7. **Best Fit:** representa compatibilidade de produto/canal, não intenção de compra. Falta de dados de compra não transforma automaticamente uma empresa em `neither`; esse resultado fica reservado a incompatibilidade demonstrada ou exclusão explícita.
8. **Separação de fornecedores:** uma execução não combina LQ e Kanechom. Isso evita que categorias, canais e requisitos de um ICP contaminem o outro.

## Próximas etapas

- **Etapa 2 — Enriquecimento:** revisar Firecrawl, timeout, páginas e evidências de contato/portfólio/canais.
- **Etapa 3 — Avaliação:** redesenhar score e Best Fit com dimensões explícitas e evidências verificáveis. Dump e Response Probability não fazem parte do modelo novo.
- **Etapa 4 — Revisão final:** revisar a função do Parallel e evitar duplicação de pesquisa já feita pelo Exa/OpenAI.
- **Monitores Exa:** fora desta etapa. A próxima implementação deverá receber eventos por webhook, validar assinatura e idempotência, localizar a lead existente por identidade/domínio e acrescentar sinais ao histórico, atualizando a lead sem criar duplicatas.

**Dump, Company Atlas/trade-file ingestion e Response Probability foram retirados** da aplicação, do pipeline ativo, das rotas e das dependências. O pacote `xlsx` também foi removido. Se um banco antigo ainda tiver colunas históricas de Response Probability, esta versão não as consulta nem atualiza.

## Validação desta entrega

- 70 testes unitários selecionados executados em ambiente local por transpilation TypeScript e Node: **70 aprovados, 0 falhas**.
- Sintaxe TypeScript/TSX analisada em todos os arquivos da aplicação: sem erros de parsing.
- Ainda não foi feita uma busca real com a API Exa nem um build Next.js de produção. A instalação completa das dependências não terminou neste ambiente; por isso, o deploy e a validação de integração externa continuam pendentes.

## Configuração local

Requisitos: Node.js 20.9 ou superior.

```bash
npm ci
npm run dev
```

Configure as chaves `EXA_API_KEY`, `FIRECRAWL_API_KEY`, `OPENAI_API_KEY` e `PARALLEL_API_KEY` no ambiente. A Etapa 1 precisa apenas da chave Exa. Firecrawl, OpenAI e Parallel entram nas etapas seguintes.

## Segurança e implantação

- Não inclua chaves, `api-keys.env`, `data/secrets.json`, dados de leads ou históricos locais no Git.
- Não conecte este repositório aos serviços Render antigos até concluir build e validação local.
- O `render.yaml` é apenas uma configuração-base; os novos serviços deverão ser criados separadamente e configurados após validação.
