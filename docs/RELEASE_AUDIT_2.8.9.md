# Auditoria de Release — Compras da JuRe 2.8.10

## Objetivo

Esta versão consolida o catálogo por setor, a classificação alimentar, o vínculo automático de compras à sessão de estabelecimento e uma revisão de UX orientada a usuários 40+.

## Regras de negócio

1. **Setor é obrigatório** no cadastro de produto.
2. **Classificação alimentar é obrigatória** para novos produtos: `Saudável` ou `Não saudável`.
3. `Não classificado` permanece somente como estado de legado/revisão, não como opção normal de novo cadastro.
4. Estabelecimento pertence à **sessão de compras**, não ao produto.
5. Ao marcar um item durante uma sessão, o item recebe automaticamente `sessionId`, `marketId` e `checkedAt`.
6. Trocar estabelecimento cria/seleciona uma nova sessão sem apagar os itens já marcados.
7. Compras históricas preservam `sectorSnapshot` e `healthSnapshot`.
8. O sistema não infere saúde por IA; a classificação é decisão do usuário.

## Migração

- IndexedDB: `DB_VERSION=7`.
- Schema lógico: `5`.
- Produtos legados recebem setor padronizado quando possível.
- `Moderado` e `Evitar` legados são normalizados para `Não saudável`; `Não classificado` continua pendente de revisão.
- Itens de compra existentes recebem snapshots de setor/classificação a partir do produto.
- Nenhum histórico é apagado.

## UX 40+

- Base tipográfica de 15px e campos de formulário de 16px.
- Inputs/selects com altura mínima de 46px.
- Contraste e hierarquia visual reforçados.
- Menos dependência de textos pequenos para ações críticas.
- Modo mercado mantém cards, checkbox amplo e leitura por blocos.
- Tabelas continuam com rolagem horizontal em telas pequenas, evitando compressão ilegível.

## Segurança de dados

- OCR continua sendo evidência, não verdade automática.
- Chaves fiscais e dados conflitantes continuam sujeitos a validação/revisão.
- A classificação alimentar não é fabricada pelo OCR ou pela IA.

## Testes executados

PASS: `tests/validate.mjs`

PASS: `tests/mobile-ux-test.mjs`

PASS: `tests/market-list-ux-test.mjs`

PASS: `tests/product-classification-test.mjs`

PASS: `tests/ux-40plus-test.mjs`

PASS: `tests/reader-engine-test.mjs`

PASS: `tests/nfce-camera-test.mjs`

PASS: `tests/nfce-server-contract-test.mjs`

PASS: `tests/fiscal-api-test.mjs`

PASS: `tests/receipt-parser-test.mjs`

PASS: `tests/receipt-fixture-test.mjs`

PASS: `tests/image-receipt-parser-test.mjs`

PASS: `tests/evidence-field-audit-test.mjs`

PASS: `tests/server-security-test.mjs`

PASS: `tests/anti-fail-audit.mjs`

## Observação

O executor agregado `tests/run-all.mjs` historicamente pode exceder o tempo de execução durante testes que inicializam workers OCR. Por isso, nesta release os testes críticos foram executados individualmente para evitar confundir timeout de infraestrutura com falha funcional.
