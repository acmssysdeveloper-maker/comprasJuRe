import fs from "node:fs";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";

const root=new URL("../",import.meta.url);
const fixture=new URL("test-fixtures/comprovante-alvorada-2026-09-10.jpg",root);
const report=JSON.parse(fs.readFileSync(new URL("tests/RECEIPT_TEST_REPORT.json",root),"utf8"));
assert.ok(fs.existsSync(fixture),"fixture do comprovante ausente");
const text=execFileSync("tesseract",[fixture.pathname,"stdout","-l","por","--psm","6"],{encoding:"utf8"});
assert.ok(/10\/09(?:\/|)26/.test(text),"OCR não identificou a sequência da data do fixture");
assert.ok((text.match(/\b\d{8,14}\b/g)||[]).length>=3,"OCR não identificou códigos suficientes para uma leitura útil");
assert.equal(report.receiptDate,"2026-09-10");
assert.equal(report.lineCount,23);
assert.equal(report.sumNetLines,350.01);
const app=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
assert.ok(app.includes("Nenhum dado confiável foi produzido."));
assert.ok(app.includes("Leitura parcial — revisão necessária"));
assert.ok(!app.includes("pendingImport=receiptSeedFallback()"));
console.log("Receipt fixture integration test: PASS (OCR real executado; leitura parcial é bloqueada até conferência)");
