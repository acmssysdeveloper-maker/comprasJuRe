# Release Audit — v2.8.12

## Escopo

Correção cirúrgica da apresentação da lista de estabelecimentos, com foco em organização visual, leitura e uso em smartphone.

## Alterações

1. Corrigida a grade raiz da lista de mercados.
2. Bairros passaram a ocupar largura integral.
3. Cards internos foram reorganizados em grade própria.
4. Cabeçalho do card recebeu hierarquia entre nome, tipo e status.
5. Endereço foi isolado em bloco legível.
6. Indicador de compras recebeu alinhamento próprio.
7. Ações foram estabilizadas em duas colunas.
8. Breakpoints foram revisados para desktop, tablet e mobile.

## Preservação funcional

Nenhuma regra de negócio de estabelecimentos, auditoria online, sessões de mercado, compras, produtos ou histórico foi alterada.

## Segurança de dados

Nenhum estabelecimento é excluído ou alterado automaticamente pela auditoria online.

## Testes

- validate: PASS
- mobile UX: PASS
- market list UX: PASS
- market update audit: PASS
- product classification: PASS
- UX 40+: PASS
- reader/OCR/fiscal/security regression suite: PASS
- `ALL TESTS: PASS`
