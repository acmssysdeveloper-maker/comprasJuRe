# JuRe — Evidência formal por campo 3.0

## Regra de publicação
Nenhum campo é considerado verdadeiro apenas porque foi retornado pelo OCR/IA. Cada valor mantém origem, método, confiança, valor observado, valor interpretado, normalização, corroborações, conflitos e motivo da aceitação ou rejeição.

## Objeto FieldEvidence

```text
evidenceId
field
required
status: CONFIRMED | INFERRED | UNCERTAIN | MISSING | CONFLICT
source
observedValue
parsedValue
normalizedValue
extractor
locator
confidence
candidates[]
corroboration[]
conflicts[]
normalization
acceptedBecause
rejectionReason
```

`observedValue` preserva o que entrou no interpretador; `parsedValue` é o valor tipado usado nos cálculos; `normalizedValue` é a forma usada nas comparações textuais. O sistema não cria coordenadas se o extrator não as forneceu.

## Evidência obrigatória por linha
Nome, quantidade, unidade, preço unitário e total da linha são obrigatórios. A linha só pode ser PASS se todos estiverem presentes, se a unidade for reconhecida e se a matemática fechar.

## Matemática
Para cada linha, o auditor calcula `quantidade × preço unitário`. Se houver desconto de linha, também calcula `bruto - desconto`. O total impresso precisa fechar com uma dessas bases dentro da tolerância monetária.

No documento inteiro, a reconciliação usa:

`grossSum - lineDiscountSum - receiptDiscount + surcharge = total`

O desconto global não pode ser aplicado duas vezes. A diferença não explicada bloqueia a publicação. Diferença positiva sem acréscimo identificado é possível cobrança a maior; diferença negativa sem desconto identificável é erro ou desconto não explicado.

## Produto
EAN/código exato tem prioridade. Sem isso, o motor cruza nome normalizado, aliases, marca, apresentação, unidade e categoria. O motor retorna candidatos e sinaliza ambiguidade quando dois candidatos são suficientemente próximos. `NEW` significa produto não associado ao catálogo, não erro.

## Duplicidade
Chave fiscal exata bloqueia duplicidade. Sem chave, o motor cruza CNPJ, data, hora, total, número do documento e assinatura dos itens.

## Rastreabilidade
A compra salva `auditEvidence` e `auditTrace`. Cada `purchaseItem` salva `fieldEvidence`. A evidência é mantida separada do valor publicado, permitindo explicar de onde veio cada campo.

## Correção manual
Uma correção deve passar novamente por `auditAndContextualizeReceipt` antes da persistência. O valor corrigido substitui o publicado somente se a nova auditoria chegar a `PASS`.
