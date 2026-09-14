# Release Audit — Compras da JuRe 2.8.7

## Escopo

Release de correção de UX e navegação mobile sobre a base 2.8.6 com branding Opção 2 preservado.

## Alterações críticas

- Sidebar mobile convertida em drawer lateral completo.
- Overlay com fechamento por toque.
- Fechamento automático após navegação.
- Fechamento por Escape.
- Botão de menu com estado ARIA.
- Áreas de toque mínimas de 44px para controles principais.
- Tabelas preservam rolagem horizontal.
- Formulários e ações reorganizados para telas estreitas.

## Integridade funcional

- `APP_VERSION`: 2.8.7
- `DB_VERSION`: 6
- `schemaVersion`: 4
- `manifest.json`: 2.8.7
- `updates/manifest.json`: 2.8.7
- `/api/status`: 2.8.7
- OCR, NFC-e, banco local e regras fiscais não foram alterados pela correção de UX.

## Validação

Resultado final registrado em `docs/TEST_RUN_2.8.7.txt`.
