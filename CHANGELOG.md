## 2.6.2 — integração fiscal robusta

- Corrigido `CONSULTADANFE_REQUEST_FIELD` para `chave`.
- Corrigida a leitura do contrato oficial `pdf_base64`/`xml_base64`.
- Adicionado segundo caminho `/api/fiscal/danfe` para envio de XML ao `/api/v1/danfe`.
- Adicionados downloads de JSON bruto, PDF e XML.
- Mantida a política de OCR como evidência auxiliar; dados fiscais recebidos da API têm prioridade.
- Adicionados testes de integração fiscal com upstream simulado.

## 2.6.1 — 11/09/2026 (integração fiscal por chave NFC-e)

- OCR/QR agora extrai e valida automaticamente a chave de 44 dígitos.
- Campo visível de chave fiscal é preenchido automaticamente e pode ser corrigido manualmente.
- Novo proxy local `/api/fiscal/consult` para Consulta DANFE, sem expor API key no navegador.
- Integração configurável por `.env`: `CONSULTADANFE_API_URL`, `CONSULTADANFE_API_KEY`, campo JSON e header de autenticação.
- Botão de fallback abre a página oficial da Consulta DANFE e copia a chave para a área de transferência quando o endpoint oficial da API não estiver configurado.
- Quando a resposta fiscal contém PDF, o sistema oferece download automático.
- A consulta fiscal não substitui a auditoria: chave, itens e total continuam sujeitos à reconciliação.

# Changelog

## 2.6.0 — 11/09/2026 (operação anti-falhas)

### Auditoria e segurança
- Removido o uso direto de chave Gemini no navegador.
- `server.mjs` é o único ponto de acesso à IA visual/Gemini e escuta em `127.0.0.1`.
- Adicionado endpoint `/api/status` e fallback `/api/ocr-space` exclusivamente pelo proxy.
- Removido `data/seed.json` para eliminar divergência entre fontes de verdade.
- Versão `2.6.0` unificada no aplicativo, service worker e manifesto de atualização.

### OCR anti-falhas
- Motor ampliado para cinco variantes de imagem e OCR regional.
- QR/NFC-e validado pelo dígito verificador antes de virar evidência fiscal.
- Reconciliação por similaridade de itens; nenhum merge ordinal cego.
- IA visual usada como escalonamento e reconciliada contra o OCR local.
- OCR secundário opcional via proxy.
- Nenhum dado é reaproveitado de outra compra quando a leitura falha.

### Integridade dos dados
- Parser numérico BR corrigido para ponto, vírgula e milhar.
- Validação matemática reforçada antes da gravação.
- Chave NFC-e válida passa a ser fingerprint primário de duplicidade.

### Testes
- Auditoria anti-falhas, segurança do proxy e regressão do comprovante real adicionadas à suíte.


## 2.5.0 — OCR robusto de comprovantes

- OCR reestruturado em múltiplas passagens Tesseract.js.
- Pré-processamento em alta resolução, contraste, nitidez e limiarização adaptativa.
- Leitura especializada por regiões do comprovante: cabeçalho, itens e rodapé.
- Consolidação das passagens OCR em vez de aceitar uma única leitura.
- Parser reforçado para códigos, quantidade, unidade, preços, totais, desconto, CNPJ, data, hora e pagamento.
- Conversão numérica preserva centavos tanto com vírgula quanto com ponto decimal.
- CNPJ passa por validação de dígitos antes de ser aceito.
- Quando o OCR local é insuficiente, a camada visual (Gemini) pode ser acionada automaticamente quando configurada.
- Nenhuma leitura parcial é tratada como dado confiável sem reconciliação.
- Novo teste `tests/ocr-hardening-test.mjs` para regressão da camada OCR.

# 2.3.3 — Importação com feedback real

- Seleção do comprovante agora abre uma pré-visualização no próprio fluxo.
- Imagens iniciam OCR automaticamente após o arquivo ser aberto.
- Fluxo apresenta etapas numeradas e tempo decorrido.
- Erros exibem causa amigável e detalhe técnico.
- PDF é pré-visualizado e orientado ao Gemini quando configurado.
- Limpeza do fluxo cancela a execução anterior e remove a pré-visualização.

# CHANGELOG

## 2.3.1 — 2026-09-10
- Revisão do pipeline de comprovantes.
- Parser preparado para itens em duas linhas.
- Data e CNPJ canonicalizados.
- Deduplicação por fingerprint reforçada.
- Proteção de data movida para a camada de persistência.
- Migração de schema 3: `purchaseDate` nos itens e `active:true`.
- Backup restaurado por substituição, incluindo `meta` e anexos.
- OCR carregado sob demanda.
- Timeout/retry nas chamadas Gemini e limite de contexto do agente.

# Changelog

## 2.0.0 — 10/09/2026
- Núcleo reestruturado em IndexedDB.
- Produto separado de ocorrência de compra.
- Compra de 10/09/2026 cadastrada como fixture real.
- Data histórica protegida na edição.
- Exclusão lógica/arquivamento.
- Catálogo sem duplicação por correspondência.
- Quantidade, preço unitário, total e desconto separados.
- Lista de compras independente do histórico.
- Consumo tratado como ritmo de aquisição.
- Economia observada separada de oportunidade estimada.
- Perfil alimentar editável.
- Manual dentro do app.
- Agente local + conector Gemini opcional.
- Backup/restore JSON.
- Atualização versionada com contrato de migração.
- Fixture do comprovante original incluída.


## 2.3.0 — leitura de comprovante auditável
- Feedback por etapa durante seleção, OCR, interpretação, validação e gravação.
- Removido fallback silencioso que reaproveitava itens já existentes quando o OCR falhava.
- OCR de imagem com pré-processamento e duas passagens (PSM 6 e PSM 4).
- Validação de total da compra contra soma das linhas antes de permitir gravação.
- Erros do Gemini agora exibem o motivo retornado pela API quando disponível.
- Data do documento bloqueada na conferência de importação.
- Teste automatizado do comprovante real incluído em `tests/receipt-fixture-test.mjs`.

## 2.3.3 — 10/09/2026
- Corrigido crash no boot causado por referência a elementos de restauração ausentes.
- Restaurar backup passou a ter controles explícitos no cabeçalho e bindings protegidos.
- Manifesto PWA não é carregado em `file://`, evitando erro CORS no teste por pasta local.
- Em `file://`, o sistema informa claramente o modo local e recomenda `iniciar-local.bat` para recursos web.
- Versão unificada para 2.3.3 nos arquivos de execução e atualização.

### Correções cirúrgicas 2.5.0
- O motor em cascata agora está realmente integrado ao aplicativo; `modules/receipt-engine.js` não é apenas código de referência.
- QR code passou a ser evidência de identidade da NFC-e, sem ser tratado como substituto dos itens da compra.
- OCR passou a usar múltiplas pré-processagens, recortes regionais e PSM especializados.
- Reconciliador deixou de fazer união cega de linhas entre passagens, reduzindo duplicação e mistura de ocorrências.
- Validação agora cruza soma das linhas, total fiscal, CNPJ e quantidade total declarada quando disponível.
- Corrigida a identificação do estabelecimento para supermercado, atacarejo, drogaria, farmácia, padaria e hortifruti.
- Criado proxy local seguro para Gemini (`server.mjs`); a chave deixa de ser necessária no navegador.
- Google Lens/Copilot permanecem como entrada externa manual de texto, não como automação dependente de scraping.

## v2.6.4 — NFC-e por câmera/QR

- Adicionado scanner de QR pela câmera traseira para smartphones.
- `BarcodeDetector` nativo é priorizado; `jsQR` permanece como fallback.
- Validação da chave fiscal e distinção automática entre modelo 55 (NF-e) e 65 (NFC-e).
- Adicionado endpoint local `/api/fiscal/nfce-qr` para consulta da URL pública fiscal contida no QR.
- Criada proteção contra URLs não HTTPS e destinos locais/privados no resolvedor de consulta pública.
- Quando a consulta pública fornece estrutura suficiente, o JuRe prepara e pode lançar a compra automaticamente.
- Quando não há dados estruturados confiáveis, o JuRe abre a consulta oficial e não inventa itens.
- Adicionado fallback de captura de foto do QR pelo navegador móvel.
