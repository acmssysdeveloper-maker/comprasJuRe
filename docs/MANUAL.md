# Manual do usuário — Compras da JuRe

## Começando

Abra `index.html` ou, de preferência, rode a pasta por `localhost`.

A primeira abertura já contém a compra real de 10/09/2026 utilizada como teste.

## Importar comprovante

1. Vá em **Importar comprovante**.
2. Escolha uma foto ou PDF.
3. Use OCR para imagem ou Gemini para leitura multimodal.
4. Revise os dados.
5. Corrija o que estiver errado.
6. Salve.

### Regra importante

A data mostrada na compra é a data do documento. Uma correção posterior não muda essa data.

## Produtos

A tela Produtos é o catálogo mestre.

O mesmo produto comprado várias vezes aparece apenas uma vez no catálogo. Cada nova compra vira uma nova ocorrência no histórico.

## Listas

Em **Minhas listas**, crie uma lista e marque os produtos do catálogo.

A lista não duplica produtos nem altera o histórico.

## Compras

Em **Compras**, veja as idas ao mercado.

Você pode:

- abrir/editar;
- corrigir quantidades;
- corrigir preços;
- arquivar;
- abrir o comprovante associado.

## Consumo

A tela Consumo mostra o ritmo de aquisição por produto.

O app não presume consumo físico sem estoque. Ele identifica padrões e desvios.

## Economia

A área Economia & perdas separa:

- economia comprovada;
- oportunidade estimada;
- possíveis sinais de excesso.

## Perfil alimentar

Edite o produto e marque:

- Saudável;
- Moderado;
- Evitar;
- Não classificado.

## Relatórios

Use **Imprimir / PDF** para gerar um relatório imprimível.

Use **Exportar JSON** para backup lógico do banco.

## Agente JuRe

Você pode perguntar:

- quanto gastei;
- qual foi minha última compra;
- como editar;
- quais produtos se repetem;
- como funciona uma lista.

Sem Gemini configurado o agente usa regras locais.

Com Gemini configurado, ele consegue sintetizar o histórico em linguagem natural.

## Gemini

Em Configurações:

1. escolha o modelo;
2. informe a chave;
3. salve.

Para uso público não coloque uma chave diretamente no front-end. O ideal é usar um backend/proxy.

## Atualizações

Antes de substituir o aplicativo:

1. faça backup;
2. publique/substitua os arquivos;
3. abra a nova versão;
4. deixe a migração trabalhar.

Não apague o perfil do navegador sem backup, porque o banco local vive no dispositivo.

## Filosofia do sistema

O Compras da JuRe deve ser conservador quando estiver inseguro.

É melhor dizer:

> “Não consegui identificar com segurança.”

do que registrar um produto ou preço errado.



## Auditoria antes do lançamento

Toda importação passa por uma etapa de auditoria antes de ser gravada. O JuRe verifica a identidade do comprovante, associa produtos ao catálogo usando código e contexto histórico, valida quantidade × preço unitário × total da linha e reconcilia a soma das linhas com o total da compra. Duplicidade fiscal exata é bloqueada. Associação ambígua ou divergência matemática impede o lançamento automático.
