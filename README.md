# Compras da JuRe — v2.8.0

Aplicação local-first para rotina doméstica de listas de compras, catálogo de itens de costume, registro offline do total por mercado e importação de comprovantes como recurso complementar.

## Execução

No Windows, execute `start-local.bat`. Ele inicia o servidor local em `http://localhost:8000`.

Sem servidor, o OCR local continua disponível ao abrir o `index.html`, mas a IA visual e o OCR secundário permanecem desativados por segurança.

## Arquitetura do leitor

`foto → QR/NFC-e → pré-processamento múltiplo → OCR Tesseract regional → parser → clustering de evidências → validação matemática → IA visual opcional → decisão`

O OCR nunca é tratado como verdade. Leituras conflitantes não são somadas cegamente. Quando a leitura não fecha, o sistema exige revisão ou bloqueia a gravação.

### Camadas

- QR-code NFC-e: usado para identidade fiscal quando a chave de 44 dígitos passa na validação do dígito verificador.
- Pré-processamento: grayscale, contraste, sombra/iluminação, sharpen e threshold adaptativo.
- OCR: múltiplas passagens em imagem inteira e regiões de cabeçalho, itens e rodapé.
- Parser: layouts multi-linha, tabular e híbrido; quantidades por peso e códigos curtos.
- Reconciliador: agrupa itens por código, nome, quantidade e total; não faz merge ordinal cego.
- IA visual: somente pelo proxy local quando o resultado local não atinge os requisitos.
- OCR secundário: opcional pelo proxy local, se `OCR_SPACE_API_KEY` estiver configurada.

## Segurança

A chave Gemini **não fica no navegador**. O servidor usa `GEMINI_API_KEY` do ambiente local. Não existe caminho de API key direta no JavaScript público.

O servidor escuta somente em `127.0.0.1`, usa cabeçalhos básicos de segurança e aplica limite de payload.

## Dados

O banco usa IndexedDB. O seed inicial fica embutido em `app.js`; não existe um segundo `data/seed.json` para evitar divergência entre fontes de verdade.

Faça backup JSON antes de qualquer atualização.

## Fixture fiscal de regressão

O pacote mantém o comprovante real de referência em `test-fixtures/comprovante-alvorada-2026-09-10.jpg`. A compra de referência possui 23 itens e total fiscal de R$ 350,01, conforme o documento usado nos testes.

O fato de o Tesseract isolado não recuperar todos os itens não é considerado sucesso: a política anti-falhas escalona a leitura ou bloqueia a gravação.

## Testes

Execute:

```bash
node tests/run-all.mjs
```

Os testes verificam versão/schema, ausência de seed duplicado, parser numérico BR, segurança da API key, proxy local, QR, OCR de regressão, parser e fixture real.


### Consulta DANFE / camada fiscal
A camada fiscal roda exclusivamente no servidor local. A configuração padrão desta versão segue o contrato publicado para `POST /api/v1/consulta`:

```env
CONSULTADANFE_API_URL=https://consultadanfe.com/api/v1/consulta
CONSULTADANFE_API_KEY=
CONSULTADANFE_REQUEST_FIELD=chave
CONSULTADANFE_AUTH_HEADER=Authorization
CONSULTADANFE_AUTH_PREFIX=
```

Há dois caminhos no aplicativo. `Consultar por chave` usa `/api/v1/consulta` para NF-e modelo 55 dentro da janela de datas do serviço. `Enviar XML e gerar DANFE` usa `/api/v1/danfe`, não depende dessa janela e aceita XML de NF-e/NFC-e conforme o contrato do serviço. Em ambos os casos o JuRe preserva o JSON bruto e permite baixar JSON, PDF e XML. Quando o XML está disponível, o servidor extrai emitente, data, total e itens diretamente do XML; o OCR deixa de ser a fonte principal desses dados.

A chave fiscal é localizada pelo QR/OCR, validada pelo dígito verificador e enviada somente pelo servidor local.


## Auditoria contextual v2.8.0

Antes de publicar uma compra, o JuRe executa uma auditoria determinística em duas frentes. No produto, usa primeiro código/EAN e depois cruza nome normalizado, abreviações, marca, embalagem, unidade e categoria com o catálogo existente. Associações ambíguas não são publicadas automaticamente.

No comprovante, o sistema rastreia CNPJ, estabelecimento, data, hora, total, número fiscal quando existente e composição das linhas. A auditoria verifica quantidade × preço unitário = total da linha, soma das linhas × total da compra, descontos, quantidade declarada de itens e duplicidades. Uma divergência crítica bloqueia o lançamento.

O fingerprint sem chave fiscal inclui estabelecimento, CNPJ, data, hora, documento, total e assinatura das linhas. Quando existe chave fiscal de 44 dígitos, ela passa a ser o identificador primário da compra para impedir duplicações.

### v2.8.0 — Auditoria antes do lançamento
O motor `modules/receipt-auditor.js` passou a auditar cada linha individualmente e o documento como um todo. O lançamento só pode avançar quando os campos obrigatórios estão presentes e a matemática fecha; dúvidas de identidade ficam em revisão e divergências financeiras bloqueiam a publicação. A especificação detalhada está em `docs/AUDITORIA_ALGORITMOS_2.0.md`.

## Fluxo principal v2.8.0 — listas primeiro
O fluxo recomendado da aplicação passou a ser offline-first para a rotina doméstica:

1. **Itens de costume:** cadastre os itens uma vez no catálogo.
2. **Planilha XLSX:** em `Minhas listas`, baixe o modelo ou importe uma planilha com as colunas `Nome do item`, `Marca`, `Categoria`, `Embalagem`, `Unidade`, `Quantidade`, `Mercado preferido` e `Código/EAN`.
3. **Lista da ida:** uma lista pode ser reutilizada várias vezes. Marque os itens efetivamente comprados.
4. **Registro rápido:** ao voltar do mercado, informe o mercado, a data e somente o **gasto total**. O JuRe não inventa preços por item.
5. **Comparação:** o histórico permite comparar total acumulado e média por ida entre mercados e listas.
6. **Offline:** catálogo, listas, registros, insights determinísticos e relatórios imprimíveis continuam funcionando sem internet.
7. **IA online:** o Agente JuRe e a leitura visual de comprovantes usam o servidor local/Gemini quando a conexão estiver disponível.

A importação de comprovantes permanece como caminho complementar, especialmente útil quando houver necessidade de preços por item e dados fiscais detalhados. Como o OCR ainda pode apresentar erros em determinados documentos, nenhum registro é considerado confirmado somente pela leitura automática.
