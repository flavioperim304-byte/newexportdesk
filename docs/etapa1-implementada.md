# Etapa 1 — descoberta: implementação

## Regras aplicadas

- Até 10 candidatas por país e por perfil de comprador.
- Uma tarefa Exa independente para cada combinação país/perfil.
- Uma busca complementar por perfil, sem trocar o ICP ou o papel pesquisado.
- Candidato exige nome/identidade, evidência de operação no país e evidência pública de categoria, cada uma com URL e trecho.
- Importador/distribuidor não é requisito de entrada. O perfil de busca fica em `discoveryProfile`; o papel real fica separado e só é confirmado com evidência específica.
- Deduplicação por domínio e limite aplicado por perfil, não no total do país.
- Prompt livre é complementar. Conflitos explícitos com buyer types e exclusões são exibidos e bloqueiam execução.
- Âncoras são opt-in, apenas referências, sem pontuação.
- LQ Professional e Kanechom não são combinados na descoberta.

## Arquivos principais

| Arquivo | Alteração |
|---|---|
| `lib/exa.ts` | Schema de evidências, validação de entrada, status do papel comercial, tarefas e backups por perfil |
| `lib/prompts.ts` | Query principal e complementar separadas, critérios de entrada e instruções de evidência |
| `lib/example.ts` | Campos estruturados preservados, detecção de conflitos e validação de servidor |
| `lib/types.ts` | `discoveryProfile`, `buyerRoleReported`, `buyerRoleStatus`, `buyerRoleEvidence` e `discoveryEvidence` |
| `components/qualify-form.tsx` | Campos estruturados sempre visíveis, prompt livre separado, âncoras opcionais e alertas de conflito |
| `components/prompt-preview.tsx` | Estimativa de volume por país e perfil |
| `components/run-desk.tsx` | Exibição de evidências e do perfil pesquisado separado do papel relatado |
| `lib/lead-db.ts` | Persistência de perfil pesquisado e status do papel comercial |
| `components/leads-board.tsx` | Exibição do perfil pesquisado e status do papel comercial |
| `lib/openai.ts`, `lib/rag.ts`, `lib/pipeline.ts`, `lib/lead-refresh.ts` | Uso do perfil de descoberta sem tratá-lo como papel confirmado |
| `lib/anchors.ts`, `lib/score.ts` | Âncoras deixam de pontuar |
| `lib/qualify.ts`, `lib/prompts.ts` | Best Fit não vira `neither` só por falta de evidência de compra |

## Remoções

- Dump, trade-file ingestion, Company Atlas e suas rotas/UI.
- Dependência `xlsx`.
- Response Probability: cálculo, tipo, exibição, CSV e novas gravações Postgres.
- Exa Monitors antigo, painel, links e webhook fixo. A futura integração está especificada em `docs/roadmap.md`.

Colunas históricas de Response Probability que já existam em um banco externo não são apagadas automaticamente; esta versão não as consulta nem atualiza.

## Limites da validação

A implementação passou nos testes locais descritos no README. Ainda falta executar uma busca real com Exa e validar o build Next.js com `npm ci` concluído. Nenhum serviço Render, repositório GitHub ou banco externo foi alterado.
