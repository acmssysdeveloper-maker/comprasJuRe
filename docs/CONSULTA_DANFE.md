# Integração Consulta DANFE / NF-e

A integração fiscal possui **dois caminhos independentes**. O primeiro consulta uma NF-e recente diretamente pela chave. O segundo envia o XML para geração do DANFE e não depende da janela de datas da consulta por chave.

## 1. Consulta por chave — NF-e modelo 55

Endpoint: `POST https://consultadanfe.com/api/v1/consulta`

Body:

```json
{"chave":"35260444823938000187551090000002691092067649"}
```

A documentação do serviço define `chave` como campo obrigatório de 44 caracteres e informa que a resposta padrão contém `status`, `chave`, `tipo`, `pdf_base64` e `xml_base64`. A rota aceita somente NF-e modelo 55 e possui janela de data limitada.

## 2. Consulta por XML — `/api/v1/danfe`

Endpoint upstream: `POST https://consultadanfe.com/api/v1/danfe`

O JuRe recebe o XML no navegador, envia-o com segurança pelo servidor local e preserva a resposta JSON. Essa rota aceita NF-e, NFC-e e outros DF-e conforme o contrato do serviço e não possui a janela de datas da rota `/consulta`. Limite informado pelo serviço: XML de até 5 MB.

## Configuração local

```env
CONSULTADANFE_API_URL=https://consultadanfe.com/api/v1/consulta
CONSULTADANFE_API_KEY=
CONSULTADANFE_REQUEST_FIELD=chave
CONSULTADANFE_AUTH_HEADER=Authorization
CONSULTADANFE_AUTH_PREFIX=
```

Se a API não exigir autenticação, `CONSULTADANFE_API_KEY` fica vazio. O JuRe não envia `Authorization` quando não há chave configurada.

## Política de confiabilidade

Quando uma chave fiscal válida estiver disponível, a resposta oficial da API é tratada como fonte fiscal primária. O OCR permanece como fonte auxiliar para preencher o que a resposta fiscal não trouxer.

Em resposta 200, o JuRe reconhece explicitamente `pdf_base64` e `xml_base64`, preserva o JSON bruto da API e permite baixar os artefatos. Em erros, o código `X-Error-Code` e os campos `error`/`message` são preservados para diagnóstico.

## Limites publicados pelo serviço

`/api/v1/consulta`: 60 requisições/minuto e somente mês corrente (mais mês anterior se hoje for antes do dia 15).

`/api/v1/danfe`: 500 requisições/minuto, XML até 5 MB e sem janela de datas.
