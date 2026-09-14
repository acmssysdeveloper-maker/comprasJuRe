# Compras da JuRe v2.8.6 — Lista-first / Offline

## Objetivo da release
O fluxo principal passa a ser a organização da compra doméstica, não a leitura automática do comprovante.

## Fluxo principal
Cadastro de itens de costume → criação/importação de lista → uso repetido da lista → marcação dos itens comprados → retorno do mercado → registro do total e mercado → histórico → comparação e insights.

## XLSX
A lista pode ser importada por `.xlsx` diretamente no navegador, sem CDN e sem internet. A aba chamada `Lista` é preferida; na ausência dela, a primeira aba é usada. A coluna obrigatória é `Nome do item` (também são aceitos `Produto`, `Item` e `Descrição`). São reconhecidas colunas opcionais para marca, categoria, embalagem, unidade, quantidade, mercado preferido e código/EAN.

A release inclui `test-fixtures/modelo-lista-compras.xlsx` e permite baixar um modelo pelo próprio aplicativo.

## Offline
IndexedDB continua sendo a base local. Listas, catálogo, registros de total por ida, comparações, insights determinísticos e impressão não dependem de internet.

## IA
A IA/Gemini permanece como recurso online complementar. O agente usa apenas o contexto do banco local enviado pelo servidor seguro. A leitura de comprovante continua disponível para situações em que o preço por item seja necessário, mas sua saída não é tratada como verdade sem auditoria.

## Registro manual de compra por lista
Registra `source=manual-list`, `purchaseType=list-total`, `listId`, mercado, data, total e um snapshot dos itens marcados. Não cria `purchaseItems` artificiais com preço zero, evitando contaminar análises de preço e consumo.

## Validação executada
- `node --check app.js`: PASS
- `tests/validate.mjs`: PASS
- `tests/xlsx-list-test.mjs`: PASS
- `tests/catalog-association-regression.mjs`: PASS
- `tests/server-security-test.mjs`: PASS
- `tests/smoke-test.js`: PASS
- `tests/receipt-fixture-test.mjs`: PASS
