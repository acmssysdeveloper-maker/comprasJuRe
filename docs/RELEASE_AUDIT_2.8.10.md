# Release Audit — Compras da JuRe v2.8.10

## Escopo

Evolução integral da 2.8.9 com foco em estabelecimentos de Saquarema, edição local, organização por bairro e conferência online sob comando do usuário.

## Entregas

- versão 2.8.10;
- IndexedDB `DB_VERSION=8`;
- migração de schema 5 → 6;
- seed inicial de estabelecimentos de Saquarema, sem apagar cadastros existentes;
- estabelecimento com nome, tipo, bairro, endereço, cidade, estado, CNPJ e ativo/inativo;
- filtros por busca, bairro e status;
- grupos visuais por bairro;
- edição manual e ativação/desativação manual;
- botão **Atualizar lista**;
- endpoint local `POST /api/markets/check`;
- fontes públicas configuráveis;
- comparação determinística;
- reconciliação opcional por Gemini;
- bloqueio explícito de alteração automática;
- auditoria da conferência;
- documentação e testes atualizados.

## Integridade do histórico

A mudança de estabelecimentos não modifica compras históricas. A relação mercado/estabelecimento continua ligada à sessão/ocorrência da compra.

## Segurança

A consulta online ocorre pelo servidor local. A chave Gemini, quando utilizada, permanece no `.env` do servidor e nunca é enviada ao navegador.

## Critério de inatividade

A ausência em uma fonte é classificada como **sem evidência suficiente**, e não como fechamento. A categoria **possivelmente inativo** fica reservada para evidência explícita fornecida pela camada de análise.

## Validação

Testes específicos executados:

- `validate.mjs` — PASS
- `market-list-ux-test.mjs` — PASS
- `market-update-audit-test.mjs` — PASS
- `mobile-ux-test.mjs` — PASS (11)
- `product-classification-test.mjs` — PASS
- `ux-40plus-test.mjs` — PASS
- `run-all.mjs` — PASS

O ambiente de execução local não conseguiu acessar diretamente as três fontes HTTPS durante o teste de rede; por isso, a rota foi validada também em modo de falha de fonte, garantindo que ela não transforme indisponibilidade em atualização falsa.
