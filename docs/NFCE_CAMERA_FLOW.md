# JuRe v2.6.4 — Fluxo câmera → NFC-e

## Objetivo

Adicionar uma entrada fiscal específica para QR Code de NFC-e, reduzindo a dependência do OCR para identificar a nota.

## Fluxo

1. O usuário toca em **Ler QR pela câmera**.
2. O JuRe solicita a câmera traseira do smartphone.
3. O scanner tenta primeiro `BarcodeDetector` nativo e usa `jsQR` como fallback.
4. O conteúdo do QR é interpretado pelo `ReceiptEngine`.
5. A chave de 44 dígitos é validada pelo dígito verificador.
6. O modelo fiscal é identificado pela própria chave: 55 = NF-e; 65 = NFC-e.
7. NF-e 55 segue para `/api/fiscal/consult` e para o endpoint configurado da Consulta DANFE.
8. NFC-e 65 segue para `/api/fiscal/nfce-qr`, que consulta a URL pública encontrada no QR.
9. Quando a consulta pública devolve dados estruturados suficientes, os dados são levados para o editor fiscal e o lançamento pode ser realizado automaticamente.
10. Quando a página pública não permite extração estruturada, o JuRe não inventa dados: a URL oficial é aberta para conferência.

## Segurança

O servidor só aceita QR URLs HTTPS e rejeita hosts locais/privados. A consulta pública é feita pelo servidor para evitar CORS no navegador.

## Limitação importante

A leitura do QR não contém, por si só, todos os itens da compra. O QR aponta para a consulta da NFC-e. A disponibilidade de XML ou de dados estruturados depende da consulta pública e da UF. Para NFC-e, o JuRe trata a consulta pública como fonte estruturada quando disponível e preserva o OCR como último recurso.

## Câmera no celular

`getUserMedia()` requer contexto seguro. Use HTTPS em hospedagem ou `localhost` no próprio dispositivo. Em ambiente sem contexto seguro, o botão **Usar foto do QR** usa `capture="environment"` como fallback do navegador.
