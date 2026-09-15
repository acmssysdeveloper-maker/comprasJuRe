# Compras da JuRe — UX dos cards de estabelecimentos 2.8.12

## Problema identificado

A versão anterior colocava o container de bairros em uma grade de três colunas. Como cada bairro já possuía sua própria grade interna de cards, os bairros ficavam lado a lado e os cards eram comprimidos, provocando quebra excessiva de palavras e ações visualmente espremidas.

## Correção

- O container raiz `#marketCards` agora empilha os bairros verticalmente.
- Cada bairro ocupa 100% da largura disponível.
- Os estabelecimentos de cada bairro formam uma grade independente.
- Desktop: até 3 cards por linha, com largura mínima de 260px.
- Tablet: 2 cards por linha.
- Smartphone: 1 card por linha.
- Nome, tipo, status, endereço, compras e ações possuem hierarquia visual separada.
- Endereço recebe área própria com quebra de linha controlada.
- Estatística de compras fica em bloco compacto e alinhado.
- Ações `Editar` e `Desativar/Reativar` ficam em duas colunas estáveis e nunca ultrapassam o card.
- Altura mínima evita cartões excessivamente baixos, mas o conteúdo continua fluido.

## Regra visual

O bairro é o agrupador principal; o estabelecimento é a unidade visual principal. Não é permitido comprimir bairros diferentes dentro da mesma linha de cards.

## Validação

`tests/market-list-ux-test.mjs` passou com as novas regras de grade e ações.
