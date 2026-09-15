# Auditoria de UX — Modo mercado 2.8.9

## Objetivo

Permitir que a pessoa use a lista diretamente no mercado, em uma tela independente, com leitura confortável e ações rápidas.

## Controles obrigatórios

- Checkbox grande para marcar item comprado.
- Preço unitário por item.
- Ação **Incluir** para acrescentar produtos do catálogo durante a compra.
- Busca de produtos sem sair da lista.
- Salvar explícito e persistência em IndexedDB.
- Layout responsivo para telas estreitas.

## Resultado

Implementado em `app.js`, `index.html` e `styles.css`. A lista é aberta pela ação `Abrir lista` e navega para `lista-ativa`, sem depender de modal para a rotina principal.
