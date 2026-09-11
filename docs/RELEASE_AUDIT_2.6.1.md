# RELEASE AUDIT 2.6.1

## Implementado
- Localização da chave fiscal em QR e texto OCR.
- Validação do dígito verificador antes de usar a chave.
- Campo visual preenchido automaticamente com a chave encontrada.
- Consulta fiscal via proxy local `/api/fiscal/consult`.
- Credencial da Consulta DANFE exclusivamente no servidor local.
- Fallback para página oficial com chave copiada quando o endpoint de API não estiver configurado.
- Download/abertura do PDF quando a resposta da API fornecer `pdf`, `pdfBase64`, `pdfUrl` ou `danfePdf`.
- Testes de regressão para extração e validação da chave.

## Limite conhecido e tratado
A página pública consultada confirma suporte a chave de 44 dígitos, NFC-e modelo 65, validação do dígito verificador e geração de DANFE-NFC-e/PDF, mas o endpoint/método/header do Playground não é exposto no HTML estático. O pacote, portanto, não inventa um endpoint: esses parâmetros ficam configuráveis por `.env`. Isso evita uma integração falsa e mantém a credencial fora do cliente.


## Correção fiscal 2.6.2

- Corrigido o contrato `/api/v1/consulta`: envio explícito de `chave`.
- Reconhecidos `pdf_base64` e `xml_base64` do contrato publicado.
- Adicionada rota local `/api/fiscal/danfe` para XML, encaminhada ao `/api/v1/danfe`.
- Adicionado download de JSON bruto, PDF e XML recebidos da camada fiscal.
- A resposta fiscal passa a ser a fonte primária quando disponível; OCR permanece auxiliar.
- Incluídos testes ponta a ponta com upstream simulado para consulta por chave, XML, validação de chave e rejeição de arquivo não XML.
