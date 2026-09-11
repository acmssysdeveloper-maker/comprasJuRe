# Release Audit — JuRe v2.7.1

## Objetivo
Formalizar evidência por campo e tornar a auditoria uma barreira anterior à publicação.

## Gate de publicação
- `BLOCK`: ausência de campo obrigatório, conflito obrigatório, matemática de linha divergente, desconto incompatível, total documental divergente, pagamento incompatível ou duplicidade fiscal/contextual forte.
- `REVIEW`: associação de produto ambígua/fraca ou duplicidade contextual não conclusiva.
- `PASS`: evidências obrigatórias presentes, linhas reconciliadas e documento reconciliado.

## Rastreabilidade persistida
- Compra: `auditEvidence`, `auditTrace`.
- Item: `fieldEvidence`.
- Campo: `evidenceId`, `source`, `observedValue`, `parsedValue`, `normalizedValue`, `extractor`, `locator`, `confidence`, `candidates`, `corroboration`, `conflicts`, `acceptedBecause`, `rejectionReason`.

## Testes
- static/security: PASS
- evidence-field-audit: PASS (12 verificações)
- receipt-audit compatibility: PASS
- anti-fail OCR: PASS
- receipt engine fiscal key: PASS
- OCR hardening: PASS
- NFC-e camera parser: PASS
- NFC-e server contract: PASS
- receipt parser: PASS
- receipt fixture: PASS
- server security: PASS
- fiscal API integration: PASS
- suíte completa: PASS

## Observação
Mensagens do Tesseract como `Image too small to scale` ainda podem aparecer durante variantes OCR. Elas não autorizam publicação; o gate depende da evidência e da auditoria estruturada.
