# Release Audit — 2.8.9

## Escopo
Modo mercado independente e UX de lista para uso durante compras no smartphone.

## Alterações validadas
- página independente `lista-ativa`;
- checkbox de toque amplo para marcar itens;
- preço por item com `inputmode=decimal`;
- inclusão de produtos do catálogo durante a compra;
- persistência de `checked`, `price`, `included` e `qty` em IndexedDB;
- layout responsivo para telas estreitas;
- versionamento funcional 2.8.9, mantendo DB_VERSION 6 e schemaVersion 4.

## Testes executados
- `node tests/validate.mjs` — PASS
- `node tests/market-list-ux-test.mjs` — PASS
- `node tests/mobile-ux-test.mjs` — PASS
- `node tests/smoke-test.js` — PASS
- `node --check app.js` — PASS
- integridade do ZIP — validada após empacotamento.
