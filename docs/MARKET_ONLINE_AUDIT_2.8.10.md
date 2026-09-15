# Auditoria online de estabelecimentos — v2.8.10

## Objetivo

A versão 2.8.10 introduz uma conferência online sob comando explícito do usuário. A função não é um sincronizador automático: ela consulta fontes públicas, cruza evidências e apresenta possíveis atualizações sem alterar a lista local.

## Regra de segurança

**Pesquisar não significa alterar.**

O fluxo é:

1. usuário abre **Mercados**;
2. usuário clica em **Atualizar lista**;
3. o servidor local consulta as fontes configuradas;
4. o motor compara os resultados com o cadastro local;
5. se houver Gemini configurado, a IA faz uma segunda reconciliação conservadora;
6. o resultado é exibido como sugestão/evidência;
7. nenhum mercado é criado, editado, desativado ou excluído automaticamente.

## Classificações

- **Novo encontrado:** nome encontrado online sem correspondência segura no cadastro.
- **Informação divergente:** nome ou endereço com evidência clara de diferença.
- **Possivelmente inativo:** somente quando houver evidência explícita de encerramento/inatividade; ausência em uma fonte nunca é tratada como prova de fechamento.
- **Sem evidência suficiente:** a fonte não confirmou o registro ou houve conflito insuficiente para conclusão.

## Fontes iniciais

As fontes são configuráveis por `MARKET_CHECK_SOURCES` no servidor local. A configuração inicial usa fontes públicas de estabelecimentos de Saquarema e pode ser substituída por fontes oficiais ou mais adequadas sem alterar o banco local.

## IA

Quando `GEMINI_API_KEY` está disponível no servidor, a resposta das fontes é enviada ao Gemini com instrução de saída JSON e regras explícitas de conservadorismo. Se a IA estiver indisponível, o sistema mantém um fallback determinístico. O navegador nunca recebe a chave Gemini.

## Histórico

Cada conferência gera um registro de auditoria local com a quantidade de possíveis atualizações. O cadastro continua sendo a fonte de verdade do usuário.

## Limitações conscientes

- uma fonte pública pode estar desatualizada;
- ausência de um nome não prova fechamento;
- nomes de redes com múltiplas unidades exigem contexto de bairro/endereço;
- diferenças de grafia não devem gerar duplicidade automática;
- a conferência depende de internet e das fontes configuradas;
- o usuário continua responsável pela decisão final.

## UX 40+

A tela usa controles grandes, filtros simples, grupos por bairro, status Ativo/Inativo, linguagem direta e contraste consistente. O usuário não precisa entender como a IA funciona para executar a conferência.
