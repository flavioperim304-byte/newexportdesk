# Roadmap técnico

## Exa Monitors — etapa futura

A integração antiga e seu webhook fixo foram retirados deste build. Quando retomarmos:

1. Criar endpoint de webhook próprio para o novo serviço, sem reutilizar a URL de produção antiga.
2. Validar a assinatura do evento antes de processar o payload.
3. Validar o tipo de evento e rejeitar payloads malformados.
4. Implementar idempotência por ID do evento/execução para não aplicar o mesmo sinal duas vezes.
5. Localizar a lead existente por domínio normalizado e, como segunda chave, identidade empresarial + país.
6. Não criar lead nova quando o monitor mencionar uma empresa já captada.
7. Anexar cada sinal ao histórico com tipo, trecho, URL, data de publicação, data de recebimento e origem `exa_monitor`.
8. Atualizar os campos atuais da lead apenas quando o sinal trouxer informação nova e atribuível; preservar histórico anterior.
9. Recalcular somente dimensões afetadas, sem transformar menção, feira ou post social isolado em intenção de compra.
10. Registrar resultado de processamento, duplicatas, eventos ignorados e falhas para auditoria.

## Itens deliberadamente fora da Etapa 1

- Enriquecimento Firecrawl e tratamento de timeout.
- Score, Fit Probability e Best Fit definitivos.
- Revisão final Parallel.
- Ingestão RAG e uso operacional do índice.
- Webhook e automação de Exa Monitors.
