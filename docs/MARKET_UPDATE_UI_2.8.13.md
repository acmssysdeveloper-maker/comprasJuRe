# Compras da JuRe — Atualização online de mercados e UX do painel — v2.8.13

## Objetivo
Corrigir o comportamento em que os resultados da conferência online permaneciam expandidos e empurravam os cards de estabelecimentos para o final da página.

## Alterações
1. **Painel fechado por padrão** — `marketUpdatePanel` começa oculto e só é aberto quando o usuário solicita a atualização.
2. **Botão X** — `closeMarketUpdateBtn` fecha o painel, limpa os resultados e devolve o espaço visual aos cards.
3. **Resultado responsivo** — os itens encontrados continuam legíveis em desktop e smartphone.
4. **Inclusão manual** — resultados com status `new` exibem `Incluir na lista`.
5. **Proteção contra duplicidade** — antes da inclusão, o sistema compara nome, bairro e endereço disponíveis.
6. **Rastreabilidade** — novos cadastros incluídos a partir da auditoria recebem `source: online-audit` e um evento de auditoria `online-include`.
7. **Nenhuma sincronização automática** — a conferência não altera, desativa ou substitui registros existentes.

## Fluxo
`Atualizar lista` → consulta online → resultados aparecem no painel → usuário revisa → `Incluir na lista` quando desejar → `X` fecha o painel.

## Segurança
- A ausência de um mercado em uma fonte não prova fechamento.
- Somente achados classificados como `new` podem ser incluídos diretamente pela interface.
- O cadastro incluído permanece editável.
- A chave Gemini nunca é enviada ao navegador.

## Compatibilidade
- Não houve mudança de schema/DB nesta versão; `DB_VERSION` permanece 9.
- A versão da aplicação passa para **2.8.13**.
