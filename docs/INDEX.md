# Documentação — Compras da JuRe 2.8.7

## Documentação vigente

- `README.md` — operação e instalação
- `docs/TECHNICAL_SPEC.md` — especificação técnica vigente
- `docs/NFCE_CAMERA_FLOW.md` — fluxo câmera/QR/NFC-e vigente
- `docs/CONSULTA_DANFE.md` — integração fiscal
- `docs/MANUAL.md` — manual do usuário
- `docs/BRANDING_OPCAO_2.md` — identidade visual vigente
- `docs/RELEASE_AUDIT_2.8.7.md` — auditoria da release vigente
- `docs/TEST_RUN_2.8.7.txt` — registro da validação da release vigente

## Documentação histórica

Arquivos com versões 2.6.x e 2.7.x registram auditorias, testes e decisões de releases anteriores. Eles **não representam o contrato vigente** da 2.8.7 e são mantidos para rastreabilidade.

- `docs/UX_MOBILE_AUDIT_2.8.7.md` — auditoria e decisões da navegação mobile.

## Regra de versionamento

- `APP_VERSION = 2.8.7`: versão funcional do aplicativo.
- `DB_VERSION = 6`: versão estrutural do IndexedDB.
- `schemaVersion = 4`: versão lógica dos metadados dos dados.

Esses três números têm responsabilidades diferentes. Alterar `DB_VERSION` só é necessário quando houver mudança estrutural no IndexedDB; alterar `schemaVersion` depende da evolução do contrato dos dados.
