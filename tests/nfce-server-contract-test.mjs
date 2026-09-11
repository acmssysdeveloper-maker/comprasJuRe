import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
assert.ok(s.includes("/api/fiscal/nfce-qr"));
assert.ok(s.includes('consultadfe.fazenda.rj.gov.br')||s.includes('fazenda\\.rj\\.gov\\.br'));
assert.ok(s.includes('qr_url_nao_permitida'));
assert.ok(s.includes('redirect:\'follow\''));
console.log('NFC-e server contract test: PASS');
