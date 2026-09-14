# Compras da JuRe — Documentação Técnica e Especificação do Sistema

**Versão:** 2.8.6  
**Data da especificação:** 10/09/2026  
**Modelo:** aplicação web/PWA estática, local-first, sem backend obrigatório.  
**Banco:** IndexedDB no dispositivo.  
**OCR:** Tesseract.js opcional por CDN para imagens.  
**IA multimodal e agente:** Gemini API opcional, com modelo configurável.

---

## 1. Objetivo do produto

O Compras da JuRe é um sistema pessoal de gestão de compras domésticas. Sua função não é apenas manter uma lista, mas preservar um histórico confiável e transformar esse histórico em:

- catálogo permanente de produtos;
- histórico de ocorrências de compra;
- histórico por mercado;
- histórico de quantidade e preço;
- listas futuras;
- comparação de preços;
- análise de ritmo de aquisição;
- oportunidades de economia;
- alertas de comportamento;
- perfil alimentar editável;
- relatórios;
- assistência conversacional.

A regra de ouro é:

> **Produto é cadastro. Compra é fato histórico. Item da compra é ocorrência. Lista é planejamento.**

---

## 2. Princípios não negociáveis

### 2.1 Histórico é protegido

A compra representa um fato ocorrido em uma determinada data. A data do documento não pode ser alterada durante uma correção normal.

Uma edição pode alterar:

- nome/mercado;
- CNPJ;
- endereço;
- preço;
- quantidade;
- descrição;
- categoria;
- marca;
- embalagem;
- desconto;
- forma de pagamento.

A data histórica permanece bloqueada.

O sistema pode registrar separadamente:

- data da compra;
- data de importação;
- data da última correção.

### 2.2 Exclusão é lógica

“Excluir” não deve destruir fisicamente o registro. O estado passa para `active=false`/arquivado. Assim:

- relatórios ativos podem ignorar o registro;
- auditoria continua preservada;
- futuras versões podem oferecer restauração;
- backups continuam podendo carregar a informação.

### 2.3 Produto repetido não duplica o catálogo

A entrada de um novo comprovante deve procurar correspondência antes de criar produto.

Ordem de prioridade:

1. código de barras/EAN;
2. marca + nome + apresentação;
3. nome normalizado + embalagem + unidade;
4. correspondência contextual;
5. confirmação humana em caso de dúvida.

### 2.4 Variante é diferente de duplicata

“Piraquê Maizena 180 g” e “Piraquê Maizena 120 g” são produtos/variantes catalogáveis distintos.

O mesmo produto em novas compras é apenas uma nova ocorrência.

### 2.5 Não inventar

Quando um campo não puder ser identificado com segurança:

- marcar como pendente de revisão;
- mostrar a incerteza;
- preservar o texto bruto;
- não completar silenciosamente com uma suposição.

---

## 3. Modelo de dados

### `markets`

- `id`
- `name`
- `legalName`
- `cnpj`
- `address`
- `city`
- `state`
- `active`
- `createdAt`

### `products`

- `id`
- `barcode`
- `name`
- `brand`
- `category`
- `pack`
- `unit`
- `health`
- `active`
- `createdAt`
- `updatedAt`

### `purchases`

- `id`
- `date` — fato histórico protegido
- `time`
- `marketId`
- `marketName`
- `cnpj`
- `total`
- `itemCount`
- `discountTotal`
- `paymentMethod`
- `receiptReference`
- `receiptName`
- `source`
- `status`
- `active`
- `createdAt`
- `updatedAt`
- `archivedAt`

### `purchaseItems`

- `id`
- `purchaseId`
- `productId`
- `barcode`
- `descriptionRaw`
- `quantity`
- `unit`
- `pack`
- `unitPrice`
- `lineTotal`
- `discount`
- `totalAfterDiscount`
- `confidence`
- `needsReview`
- `purchaseDate`
- `createdAt`
- `updatedAt`

### `lists`

- `id`
- `name`
- `createdAt`
- `updatedAt`
- `active`
- `items[]`

Cada item de uma lista contém:

- `productId`
- `name`
- `qty`
- `checked`

### `audit`

- `id`
- `at`
- `message`
- `entity`
- `entityId`
- `type`

---

## 4. Fluxo de importação de comprovante

```text
Arquivo
  ↓
leitura/OCR ou Gemini multimodal
  ↓
dados brutos
  ↓
normalização
  ↓
identificação de mercado
  ↓
identificação de produto
  ↓
validação matemática
  ↓
níveis de confiança
  ↓
revisão humana quando necessário
  ↓
gravação da compra
  ↓
gravação das ocorrências de itens
  ↓
catálogo/histórico
```

---

## 5. Identificação do mercado

O sistema deve considerar conjuntamente:

- CNPJ;
- razão social/nome;
- endereço;
- cidade;
- UF;
- chave fiscal, quando disponível;
- histórico de ocorrências.

Exemplo:

> CNPJ confere; nome parcialmente legível; cidade compatível.

Resultado:

> **“Acredito que este seja o Supermercados Alvorada. O CNPJ e a localidade conferem. Confirme antes de salvar.”**

A ausência de um campo não deve impedir automaticamente a identificação se outras âncoras forem fortes.

---

## 6. Identificação de produto

### Regra principal

```text
EAN exato → correspondência forte
```

Sem EAN:

```text
marca + nome + embalagem + unidade
```

Com diferenças de abreviação:

- remover acentos;
- normalizar caixa;
- substituir pontuação;
- condensar espaços;
- comparar tokens.

Exemplo:

`BISC MAIZ PIRAQ 180G`

versus

`Biscoito Maizena Piraquê 180 g`

podem representar o mesmo item se a embalagem e outros sinais também forem compatíveis.

---

## 7. Itens e matemática

Cada linha deve manter:

```text
quantidade
unidade
preço unitário
total da linha
desconto
total líquido
```

Validação:

```text
quantidade × preço unitário ≈ total da linha
```

A tolerância deve ser pequena e explicitamente definida.

O total da compra também deve ser comparado com a soma das linhas líquidas.

Quando não fechar:

> **“A nota não foi conciliada com segurança.”**

Nunca mascarar a divergência.

---

## 8. Exemplo real cadastrado

O pacote contém o comprovante fornecido e a compra de:

**10/09/2026**

**Supermercados Alvorada**

**CNPJ:** 17.833.301/0022-23

**Valor:** R$ 350,01

**Desconto informado:** R$ 2,00

**Quantidade de itens:** 23 ocorrências de linha.

A soma líquida das 23 linhas do modelo inicial fecha em **R$ 350,01**.

O arquivo original é mantido em:

`test-fixtures/comprovante-alvorada-2026-09-10.jpg`

---

## 9. Quantidade não é número de ocorrências

Exemplo:

> Leite Integral Capel 1 L  
> 6 unidades × R$ 4,79  
> Total R$ 28,74.

É:

- 1 ocorrência no comprovante;
- quantidade = 6;
- preço unitário = R$ 4,79;
- total = R$ 28,74.

Isso é fundamental para a curva de aquisição.

---

## 10. Curva de consumo

O sistema começa pelo que é observável no comprovante:

> **ritmo de aquisição**

Não afirmar consumo físico sem dados de estoque/consumo.

Com três ou mais ocorrências, o sistema pode comparar:

- média por ocorrência;
- última quantidade;
- desvio do padrão;
- intervalo entre compras.

Exemplo:

> Média histórica: 5,6 unidades  
> Última compra: 10 unidades  
> Sinal: quantidade acima do padrão.

Linguagem deve ser cotidiana:

> “Você comprou bem mais desse produto desta vez. Pode ter sido uma necessidade pontual; vale observar se isso se repete.”

---

## 11. Histórico de preços

Para cada produto:

- menor preço;
- maior preço;
- média;
- último preço;
- variação percentual;
- histórico por mercado.

Comparação por mercado só deve ser apresentada como conclusão quando houver dados comparáveis.

---

## 12. Economia

Três estados:

### Economia comprovada

Informação explicitamente presente na compra, como desconto.

### Oportunidade estimada

Comparação com histórico de preço.

### Possível excesso

Desvio de quantidade/frequência em relação ao próprio padrão.

O sistema nunca deve chamar automaticamente uma diferença de preço de “perda” sem base.

---

## 13. Perfil alimentar

Cada produto aceita:

- Saudável
- Moderado
- Evitar
- Não classificado

Essa classificação é educativa, editável e não substitui orientação nutricional profissional.

O perfil pode alimentar insights como:

> “Sua lista deste mês tem mais itens que você marcou como ‘Evitar’.”

---

## 14. Listas

Uma lista futura utiliza o catálogo mestre.

Exemplo:

```text
☑ Piraquê Maizena 180 g
☑ Leite Capel 1 L
☑ Ovos Mantiqueira c/20
```

Marcar um produto para uma lista não cria outra cópia do produto.

A lista é independente do histórico.

---

## 15. Agente JuRe

O agente é dividido em duas camadas:

### Camada determinística

Sem IA externa:

- total gasto;
- última compra;
- produtos recorrentes;
- instruções do manual;
- respostas sobre regras do sistema.

### Camada Gemini

Com chave configurada:

- linguagem natural;
- síntese de tendências;
- explicações;
- perguntas complexas sobre o histórico.

O contexto enviado à IA é controlado e formado por:

- resumo;
- compras;
- produtos;
- ocorrências recentes;
- regras do manual.

Por segurança, ações destrutivas não devem ser executadas automaticamente pelo agente.

---

## 16. Gemini

No momento desta documentação, a documentação oficial do Google indica nível gratuito para a Gemini API, com limites e acesso restrito a certos modelos; o `gemini-3.7-flash` tem nível sem custo financeiro na tabela oficial. citeturn448433search0turn281674search3

A documentação atual mostra `gemini-3.7-flash` como modelo estável e multimodal, com entrada de imagem e PDF. citeturn281674search0

O endpoint REST `models.generateContent` está documentado oficialmente. citeturn281674search2

### Segurança da chave

A própria documentação do Google orienta a não expor chaves de API diretamente no cliente em produção e recomenda backend/proxy para uso público. citeturn448433search3

Por isso:

- a chave fica apenas no ambiente do servidor local;
- é opcional;
- não é armazenada no navegador;
- o navegador conversa com `/api/vision` e `/api/chat` no proxy local.

---

## 17. Atualizações

O aplicativo adota:

```text
APP_VERSION
DB_VERSION
schemaVersion
migrate()
updates/manifest.json
```

### Regra de atualização

1. fazer backup;
2. substituir arquivos da aplicação;
3. abrir nova versão;
4. executar migrações;
5. manter banco IndexedDB;
6. validar versão;
7. continuar usando o histórico.

### Importante

Um navegador não deve ter permissão para sobrescrever arbitrariamente os próprios arquivos da aplicação.

Portanto, o mecanismo seguro é:

- pacote local versionado;
- ou hospedagem estática (GitHub Pages, servidor local ou outro host);
- a nova versão substitui os arquivos;
- o IndexedDB permanece no navegador.

A aplicação detecta a versão e o manifesto; ela não “se reescreve” de modo inseguro.

---

## 18. PWA ou HTML?

O núcleo funciona como HTML/CSS/JS puro.

Para experiência PWA:

- `manifest.json`
- `sw.js`
- HTTPS ou `localhost`

Para testes locais:

```text
python -m http.server 8000
```

Depois:

```text
http://localhost:8000
```

Abrir `index.html` diretamente também serve para testar a interface, mas PWA/service worker funcionam melhor via servidor.

---

## 19. Estrutura de arquivos

```text
Compras_da_JuRe_v2/
├── index.html
├── styles.css
├── app.js
├── manifest.json
├── sw.js
├── README.md
├── docs/
│   └── MANUAL.md
├── modules/
│   └── update-contract.js
├── updates/
│   └── manifest.json
├── data/
│   └── seed.json
└── test-fixtures/
    └── comprovante-alvorada-2026-09-10.jpg
```

---

## 20. Critérios de aceite

O sistema deve passar pelos seguintes testes antes de cada release:

### Teste A — inicialização

- abre;
- banco é criado;
- compra de 10/09 aparece;
- dashboard funciona.

### Teste B — catálogo

- 23 ocorrências;
- produtos distintos não duplicados;
- catálogo separado de compras.

### Teste C — data

Editar preço/quantidade de uma compra de 10/09 não muda `date`.

### Teste D — arquivamento

Arquivar uma compra tira da análise ativa, mas mantém o registro.

### Teste E — matemática

Cada linha deve ter quantidade × preço unitário ≈ total.

### Teste F — lista

Selecionar um produto existente não cria produto duplicado.

### Teste G — mercado

CNPJ deve ser usado como âncora forte.

### Teste H — backup

JSON deve conter banco lógico suficiente para restauração.

### Teste I — agente

Sem Gemini: resposta local.

Com Gemini: contexto do banco e manual.

### Teste J — update

Versão nova deve abrir sem perder IndexedDB.

---

## 21. Próximas extensões compatíveis

A arquitetura foi deliberadamente preparada para:

- restauração de registros arquivados;
- importação de backup;
- exportação completa com anexos;
- OCR de PDF local;
- leitura multimodal Gemini de PDF;
- catálogo de famílias/variantes;
- comparação por preço equivalente (kg/L/un);
- curva mensal e diária;
- sazonalidade;
- previsão de próxima compra;
- associação lista → compra realizada;
- dashboard de inflação própria;
- análises por marca;
- análises de alimentação.

Essas extensões devem ser feitas em módulos, com migração e testes, sem reescrever o histórico.


## 22. Motor de confiança e conciliação

O motor deve produzir uma pontuação de confiança por entidade, não apenas um único “resultado do OCR”.

### Mercado

Uma implementação inicial recomendada:

```text
score_mercado =
  0.45 × cnpj_match +
  0.20 × chave_fiscal_match +
  0.15 × nome_match +
  0.10 × localidade_match +
  0.10 × endereço_match
```

Cada componente fica entre 0 e 1.

Faixas:

- `>= 0,90`: vinculação automática permitida;
- `0,75–0,89`: sugerir correspondência e pedir confirmação;
- `< 0,75`: não vincular automaticamente.

### Produto

Prioridade:

```text
EAN exato                    → 1,00
EAN + apresentação conflitante → não vincular
marca + nome + pack           → 0,90
nome + pack + unidade         → 0,80
nome aproximado               → 0,60–0,78
```

A apresentação (`pack`) é uma barreira de segurança: peso/volume/unidade diferente não deve ser ignorado apenas porque a marca e o nome são semelhantes.

### Compra duplicada

Uma nova importação deve gerar uma assinatura de documento:

```text
fingerprint = hash(
  normal(cnpj) +
  date +
  normal(documentNumber) +
  round(total,2)
)
```

Quando o número do documento não estiver disponível, usar combinação de CNPJ + data + total + lista resumida de códigos/itens.

Se a assinatura coincidir, o sistema deve perguntar antes de criar uma nova compra.

---

## 23. Regras de integridade matemática

Para cada linha:

```text
expected = round(quantity × unitPrice, 2)
delta = abs(expected - lineTotal)
```

Uma pequena tolerância pode existir para arredondamentos de centavos. Acima da tolerância:

```text
needsReview = true
```

Para a compra:

```text
sum(lines.totalAfterDiscount) ≈ purchase.total
```

Caso não feche, a compra pode ser salva como “revisão pendente”, mas nunca como “conferida” silenciosamente.

---

## 24. Regras de quantidade

A quantidade da linha deve ser preservada como o documento informa:

- `6 UN` → 6 unidades;
- `1,600 KG` → 1,600 kg;
- `2 UN × R$ 12,98` → quantidade 2, não duas linhas de produto;
- `C/20` pertence à apresentação/embalagem, não à quantidade comprada.

Isso permite separar:

```text
quantidade comprada
≠
conteúdo da embalagem
```

Exemplo:

> 2 caixas de ovos c/20 = 2 unidades de embalagem, 40 ovos de conteúdo potencial.

Essa distinção deve ser preservada para futuras análises.

---

## 25. Histórico de preço por unidade comparável

Quando possível, converter apresentações para uma unidade comum:

- g → kg;
- ml → L;
- unidade → unidade;
- kg → kg;
- L → L.

Exemplo:

```text
500 g por R$ 5,49
→ R$ 10,98/kg

1 kg por R$ 9,90
→ R$ 9,90/kg
```

O preço equivalente não substitui o preço efetivamente pago. É um indicador derivado.

---

## 26. Algoritmo de consumo

Não chamar automaticamente aquisição de consumo físico.

O nível básico é:

```text
ritmo de aquisição = quantidade comprada por período
```

Com histórico suficiente, calcular:

- média;
- mediana;
- intervalo médio entre compras;
- desvio relativo;
- tendência recente.

Um alerta inicial pode usar:

```text
última quantidade > média × 1,50
```

Mas alertas devem ser classificados como:

> “quantidade acima do seu padrão”

em vez de:

> “você desperdiçou”.

Sazonalidade, eventos e mudanças de rotina podem ser adicionados em módulo futuro.

---

## 27. Economia e “perda”

A aplicação deve sempre separar três bases:

### Observado

Fato presente no documento.

Exemplo: desconto de R$ 2,00.

### Comparado

Fato derivado de histórico.

Exemplo: o último preço está R$ 0,70 acima da média.

### Estimado

Projeção ou oportunidade.

Exemplo: comprar em outro mercado poderia economizar aproximadamente R$ 4,20, usando registros históricos comparáveis.

Não misturar as três categorias no mesmo número.

---

## 28. Insights em linguagem cotidiana

O motor de insight deve produzir frases curtas, contextualizadas e acionáveis.

Formato interno:

```text
insight = {
  type,
  severity,
  evidence,
  comparisonPeriod,
  message,
  action
}
```

Exemplo:

```text
Tipo: price-above-average
Evidência: +12%
Mensagem: "Este produto ficou um pouco mais caro que o normal."
Ação: "Vale conferir outro mercado na próxima compra."
```

O usuário não deve receber fórmulas estatísticas como mensagem principal.

---

## 29. Agente: acesso ao banco sem perder controle

O agente deve ter ferramentas lógicas do tipo:

```text
getDashboardSummary()
searchProducts(query)
getProductHistory(productId)
compareMarkets(productId)
getPurchase(purchaseId)
getList(listId)
searchManual(query)
```

Em modo de leitura, essas ferramentas só consultam dados.

Ações futuras podem ser separadas:

```text
proposeEditPurchase()
proposeCreateList()
proposeArchivePurchase()
```

Uma ação destrutiva nunca deve ser executada apenas porque a IA “entendeu” uma frase. Deve existir confirmação explícita.

---

## 30. Privacidade e operação local

O sistema é local-first.

Sem Gemini:

```text
comprovante → banco local → análises locais
```

Com Gemini:

```text
usuário solicita → contexto mínimo necessário → API Gemini → resposta
```

A aplicação não exige servidor para o funcionamento básico.

---

## 31. Atualização sem perda de dados

O banco IndexedDB é separado dos arquivos HTML/JS.

Portanto:

```text
atualização do app
≠
apagar banco
```

Cada mudança estrutural deve:

1. aumentar `DB_VERSION`;
2. criar/alterar stores de modo incremental;
3. migrar registros;
4. manter compatibilidade com dados anteriores;
5. registrar a versão da migração.

---

## 32. Estratégia de testes por comprovante

Cada comprovante usado para homologação deve ter:

- imagem original;
- resultado esperado em JSON;
- soma esperada;
- número de linhas esperado;
- identificação esperada do mercado;
- identificação esperada da data;
- casos de produto repetido;
- casos de produto por peso;
- casos de desconto;
- casos de embalagem;
- casos de item ambíguo.

O comprovante de 10/09/2026 já funciona como fixture inicial.

---

## 33. Critério de release

Não considerar uma versão “pronta” apenas porque a tela abre.

Uma release deve atender simultaneamente:

```text
UI
+ persistência
+ integridade matemática
+ conciliação
+ histórico
+ edição
+ arquivamento
+ listas
+ backup
+ migração
+ testes do comprovante
```

Se algum núcleo estiver instável, novas funcionalidades devem esperar.

---

## 34. Limites conhecidos do v2.8.6

### 34.1 Política de leitura segura

O Tesseract local não é considerado fonte fiscal definitiva em fotografias de papel térmico. A leitura só pode ser gravada quando os dados essenciais estiverem reconciliados. Quando a política de qualidade falha, o sistema deve escalar para a visão multimodal pelo proxy local ou apresentar o editor para conferência manual.

O QR code, quando decodificado e validado pelo dígito verificador da chave de 44 posições, é tratado como evidência forte de identidade da NFC-e. Ele não substitui os itens, preços ou quantidades do corpo do documento.

A chave Gemini não é armazenada no navegador. O único caminho aceito pela 2.8.6 é o `server.mjs`, com `GEMINI_API_KEY` no ambiente local.



1. O OCR de imagem usa uma biblioteca carregada sob demanda e depende de internet na primeira carga da biblioteca.
2. Leitura multimodal de PDF está disponível quando Gemini estiver configurado.
3. O comparativo de preços melhora progressivamente com histórico; não existe inferência confiável de mercado com uma única ocorrência.
4. Perfil alimentar é um rótulo de organização pessoal, não diagnóstico ou aconselhamento nutricional.
5. Chave Gemini direta no navegador não é suportada pela 2.8.6; o acesso é exclusivamente pelo proxy local.
