# Release Audit — Compras da JuRe 2.8.6

**Status:** RELEASE CANDIDATE VALIDADO
**Data:** 2026-09-14

## Escopo

Esta auditoria consolida a versão 2.8.6 após a adoção do branding Opção 2 e a sincronização cirúrgica de versão, schema, documentação, manifesto e suíte de testes.

## Contrato de versão

- `APP_VERSION`: 2.8.6
- `DB_VERSION`: 6 (versão estrutural do IndexedDB)
- `schemaVersion`: 4 (versão lógica dos metadados de dados)
- `manifest.json`: 2.8.6
- `updates/manifest.json`: 2.8.6
- `/api/status`: 2.8.6
- UI: 2.8.6

`DB_VERSION` e `schemaVersion` são conceitos distintos e não devem ser igualados artificialmente.

## Integridade de dados

- Seed embutido alinhado a `schemaVersion: 4` e `appVersion: 2.8.6`.
- Seed continua sendo a única fonte inicial; não existe `data/seed.json`.
- Migração mantém compatibilidade com metadados anteriores e normaliza o schema lógico para 4.
- Restauração de backup grava metadados no schema lógico 4.
- Exclusão de produto permanece lógica/segura para não romper histórico.

## Atualização e cache

- O service worker permanece intencionalmente desativado para impedir código/cache obsoleto.
- A limpeza de cache antigo usa o marcador 2.8.6.
- O manifesto de atualização aponta para 2.8.6.

## Branding

A Opção 2 foi preservada como identidade ativa, com ícones PWA, favicon, Apple touch icon e logos atualizados.

## Documentação

Os documentos operacionais foram sincronizados para 2.8.6. Os documentos de auditoria/teste de versões anteriores permanecem no pacote como **histórico**, sem serem apresentados como documentação vigente.

## Validação

A suíte `node tests/run-all.mjs` deve terminar com `ALL TESTS: PASS`. Este arquivo registra o contrato esperado da release e não substitui a execução da suíte.
