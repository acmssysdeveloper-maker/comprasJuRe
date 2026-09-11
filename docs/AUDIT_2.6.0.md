# Auditoria anti-falhas — Compras da JuRe 2.6.0

## Objetivo

Eliminar os pontos em que uma leitura parcial pudesse virar dado persistente incorreto.

## Correções aplicadas

1. **Segurança da IA** — removido o caminho de chave Gemini no navegador; IA e agente usam proxy local.
2. **Fonte única do seed** — removido `data/seed.json`; o seed de inicialização permanece embutido em `app.js`.
3. **Versão** — `2.6.0` unificada no aplicativo, manifesto, service worker e atualização.
4. **Números BR** — `num()` passou a reconhecer `350,01`, `350.01` e `1.234,56` sem transformar centavos em milhares.
5. **OCR** — motor ampliado com cinco variantes de imagem, regiões de cabeçalho/itens/rodapé e dois modos de segmentação na imagem inteira.
6. **QR** — chave NFC-e só é aceita depois de validar os 44 dígitos e o dígito verificador.
7. **Reconciliação** — leituras não são mais mescladas por posição de linha; itens são agrupados por evidência textual/numérica.
8. **Escalonamento** — leitura local incompleta ou inconsistente aciona visão pelo proxy local; se disponível, OCR secundário também pode ser tentado.
9. **Validação** — gravação exige itens, nomes/valores, total, CNPJ válido quando informado, contagem compatível e fechamento matemático.
10. **Duplicidade** — quando existe chave NFC-e válida, ela passa a ser o fingerprint primário.

## Resultado dos testes

- `validate.mjs`: PASS
- `anti-fail-audit.mjs`: PASS
- `reader-engine-test.mjs`: PASS
- `ocr-hardening-test.mjs`: PASS
- `receipt-parser-test.mjs`: PASS
- `receipt-fixture-test.mjs`: PASS
- `server-security-test.mjs`: PASS
- smoke do servidor local `/api/status`: PASS

## Limite técnico conhecido

O Tesseract sozinho continua podendo falhar em fotografias reais de papel térmico. Isso não é mascarado pelo sistema. A política da 2.6.0 trata OCR como evidência e exige escalonamento/revisão quando a leitura não fecha.
