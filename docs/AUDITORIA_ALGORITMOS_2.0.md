# JuRe — Especificação do Motor de Auditoria 2.0

## Objetivo

Transformar uma imagem/documento fiscal em uma estrutura de dados verificável, com análise isolada de cada linha e reconciliação matemática do documento inteiro antes da persistência.

## Ordem obrigatória

1. Capturar evidências do documento.
2. Segmentar linhas candidatas de produtos.
3. Criar `lineId` individual.
4. Interpretar nome, código, unidade, quantidade, preço unitário, total e descontos.
5. Cruzar com o catálogo histórico.
6. Auditar a matemática da linha.
7. Auditar a matemática do documento.
8. Auditar pagamento/troco quando disponíveis.
9. Auditar duplicidade.
10. Definir `PASS`, `REVIEW` ou `BLOCK`.
11. Só depois permitir persistência.

## Auditoria de linha

Cada linha deve possuir nome, quantidade, unidade, preço unitário e total de linha. O resultado inclui `checks`, campos ausentes, `expectedTotal`, `mathDelta` e estado.

Regra monetária padrão:

`round2(quantidade × preço_unitário) = total_da_linha ± R$ 0,03`

Produtos vendidos por peso/volume usam a mesma relação com a unidade identificada. Conteúdo de embalagem, como `c/12`, é atributo da apresentação e não altera automaticamente a quantidade comprada.

## Auditoria do documento

`grossSum = soma dos totais brutos das linhas`

`lineDiscountSum = soma dos descontos explicitamente atribuídos às linhas`

`receiptDiscount = desconto informado no documento - descontos já atribuídos às linhas`

`expectedTotal = grossSum - lineDiscountSum - receiptDiscount + surcharge`

O total publicado só é aceito quando `expectedTotal` fecha com o total do documento dentro da tolerância monetária.

### Diferença para menos

Se o total for inferior ao valor esperado, o motor procura evidência de desconto. Diferença não explicada bloqueia a publicação.

### Diferença para mais

Se o total for superior ao valor esperado, o motor procura acréscimos identificados. Diferença sem explicação é tratada como possível cobrança a maior e bloqueada.

## Pagamento

Para meios não monetários, `valor pago` deve coincidir com o total. Para dinheiro, o motor pode validar `valor entregue - troco = total` quando ambos estiverem presentes.

## Identidade do produto

Prioridade:

1. EAN/código exato.
2. Código + estabelecimento.
3. Nome normalizado + marca + apresentação.
4. Alias histórico + atributos corroborantes.
5. Similaridade textual contextual.

Sem evidência suficiente o item permanece novo/revisão; o motor não deve fundir produtos apenas por aparência textual.

## Duplicidade

Chave fiscal exata é o critério máximo. Na ausência de chave, usar CNPJ, data, hora, total, número do documento e assinatura dos itens. Coincidência forte bloqueia lançamento automático.

## Evidência e correção

A aplicação deve preservar separadamente:

- evidência original;
- interpretação do motor;
- valor auditado/publicado;
- correções manuais e horário da correção.

Uma correção manual deve provocar nova auditoria antes da persistência.

## Estados

- `PASS`: todas as verificações obrigatórias fecham.
- `REVIEW`: matemática fecha, mas existe associação/identidade que requer confirmação.
- `BLOCK`: falta campo obrigatório, cálculo divergente, desconto/acréscimo inconsistente, total não reconciliado ou outra falha impeditiva.
