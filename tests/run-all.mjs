import {execFileSync} from 'node:child_process';
const tests=['tests/validate.mjs','tests/evidence-field-audit-test.mjs','tests/anti-fail-audit.mjs','tests/reader-engine-test.mjs','tests/ocr-hardening-test.mjs','tests/nfce-camera-test.mjs','tests/nfce-server-contract-test.mjs','tests/receipt-parser-test.mjs','tests/receipt-fixture-test.mjs','tests/server-security-test.mjs','tests/fiscal-api-test.mjs','tests/mobile-ux-test.mjs','tests/market-list-ux-test.mjs','tests/market-update-audit-test.mjs','tests/product-classification-test.mjs','tests/ux-40plus-test.mjs'];
for(const t of tests){console.log(`\n>>> ${t}`);execFileSync(process.execPath,[t],{stdio:'inherit',cwd:process.cwd()});}
console.log('\nALL TESTS: PASS');
