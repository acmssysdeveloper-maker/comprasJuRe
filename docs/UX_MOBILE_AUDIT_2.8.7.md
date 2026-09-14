# Auditoria UX Mobile — Compras da JuRe 2.8.7

## Objetivo

Corrigir a navegação em smartphones e eliminar o comportamento anterior de barra inferior truncada que escondia itens do menu.

## Decisões

- Sidebar completa em drawer lateral para larguras até 820px.
- Overlay de proteção contra toque acidental fora do menu.
- Fechamento por seleção de página, toque no overlay e tecla Escape.
- Botão de menu fixo com área de toque de 44px.
- Cabeçalho com espaço reservado para o botão de menu.
- Ações de seção reorganizadas para uma ou duas colunas conforme a largura.
- Tabelas mantêm rolagem horizontal em vez de esmagar colunas.
- Formulários e ações principais recebem largura total em telas muito estreitas.

## Compatibilidade

A alteração é exclusivamente de UX/navegação e não altera o schema IndexedDB (`DB_VERSION=6`, `schemaVersion=4`).

## Versionamento

- Aplicativo: 2.8.7
- Manifesto: 2.8.7
- API status: 2.8.7
