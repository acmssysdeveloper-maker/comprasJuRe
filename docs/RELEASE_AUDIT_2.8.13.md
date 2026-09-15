# Release Audit — Compras da JuRe v2.8.13

## Escopo
Correção da UX da atualização online de mercados e inclusão deliberada de novos estabelecimentos encontrados.

## Checklist técnico
- [x] APP_VERSION = 2.8.13
- [x] DB_VERSION mantido em 9 por ausência de alteração estrutural de dados
- [x] Manifest = 2.8.13
- [x] Updates manifest = 2.8.13
- [x] Server `/api/status` = 2.8.13
- [x] Painel de atualização inicia oculto
- [x] Botão X fecha e limpa resultados
- [x] Novos achados apresentam ação `Incluir na lista`
- [x] Inclusão gera ID próprio e preserva editabilidade
- [x] Inclusão registra auditoria
- [x] Nenhuma atualização existente é alterada automaticamente
- [x] Regra conservadora para inatividade preservada
- [x] Documentação técnica atualizada

## Critério de aceitação
Após clicar em `Atualizar lista`, os resultados ocupam uma área própria. Ao clicar em `X`, essa área desaparece e os cards de mercados retornam imediatamente para o fluxo normal da página.
