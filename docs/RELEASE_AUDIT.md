# Release audit — 2.6.0

Status: **APROVADO PARA TESTE OPERACIONAL**

## Proteções obrigatórias

- Nenhuma chave Gemini é armazenada no navegador.
- Nenhuma API key é enviada diretamente pelo JavaScript público.
- OCR parcial não vira compra automaticamente.
- QR só vira evidência fiscal após validação da chave.
- Divergências entre fontes são preservadas.
- O total precisa fechar com as linhas antes da gravação.
- Quantidade × preço unitário precisa fechar com o total da linha.
- Backup e histórico continuam em IndexedDB; exclusão é lógica.
- Seed existe em um único lugar (`app.js`).

## Teste do comprovante real

O Tesseract isolado continua produzindo leitura parcial para a fotografia real de referência. Isso é esperado e agora é tratado como condição de escalonamento, não como sucesso. A suíte confirma que a leitura parcial não pode ser confundida com dados fiscais completos.

## Resultado da suíte

`tests/run-all.mjs` terminou com `ALL TESTS: PASS`.
