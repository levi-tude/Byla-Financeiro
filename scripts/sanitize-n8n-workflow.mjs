import fs from 'node:fs';

const src = process.argv[2];
const dest = process.argv[3];
const name = process.argv[4] || 'Demo workflow';

if (!src || !dest) {
  console.error('Usage: node sanitize-n8n-workflow.mjs <src.json> <dest.json> [name]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
delete raw.id;
delete raw.versionId;
delete raw.meta;
delete raw.pinData;
raw.name = name;
raw.active = false;
raw.tags = [];

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === 'credentials') continue;
      if (k === 'webhookId') continue;
      if (k === 'id' && typeof v === 'string') {
        out[k] = 'NODE_ID_PLACEHOLDER';
        continue;
      }
      if (typeof v === 'string') {
        let s = v
          .replace(/https?:\/\/[^\s"'\\]+/g, 'https://example.com')
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '00000000-0000-4000-8000-000000000000')
          .replace(/AKfycb[A-Za-z0-9_-]+/g, 'AKfycbxDEMO_PLACEHOLDER')
          .replace(/\b1[A-Za-z0-9_-]{30,}\b/g, 'DEMO_SPREADSHEET_ID')
          .replace(/n8n\.espacobyla\.online/gi, 'n8n.example.com')
          .replace(/byla-backend\.onrender\.com/gi, 'api.example.com')
          .replace(/espacobyla/gi, 'example-org');
        if (/secret|token|apikey|authorization|apikey/i.test(k)) s = '{{$env.SECRET_PLACEHOLDER}}';
        out[k] = s;
        continue;
      }
      out[k] = scrub(v);
    }
    return out;
  }
  return value;
}

const clean = scrub(raw);
fs.writeFileSync(dest, JSON.stringify(clean, null, 2));
console.log('wrote', dest);
