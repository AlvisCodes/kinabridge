#!/usr/bin/env node
/**
 * End-to-end pipeline verification.
 * Simulates exactly what the Pi bridge does each poll cycle.
 * Run: node verify-pipeline.js
 */
import fetch from 'node-fetch';
import config from './src/config.js';
import { createTokenProvider } from './src/kinabaseAuth.js';
import { toKinabaseRecords } from './src/transform.js';

const BASE = config.kinabase.baseUrl;
const COL = config.kinabase.collection;

console.log('\n=== Kinabridge Pipeline Verification ===\n');
console.log(`API: ${BASE}`);
console.log(`Collection: ${COL}\n`);

let failures = 0;
const ok = (step, msg) => console.log(`  ✅ ${step} — ${msg}`);
const bad = (step, msg) => { failures++; console.log(`  ❌ ${step} — ${msg}`); };

// 1. Token
console.log('1. Authentication');
const tokenProvider = createTokenProvider();
let token;
try {
  token = await tokenProvider();
  ok('Get JWT token', `${token.substring(0, 30)}...`);
} catch (e) {
  bad('Get JWT token', e.message);
  process.exit(1);
}
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' };

// 2. Transform
console.log('\n2. Transform (InfluxDB → Kinabase format)');
const fakeInflux = [{
  machine: 'EnvironmentalSensor',
  timestamp: new Date().toISOString(),
  source: 'shoestring-humidity-monitoring',
  fields: { temperature: 21.5, humidity: 48.3, pressure: 1015.2 }
}];
const transformed = toKinabaseRecords(fakeInflux);
if (transformed.length === 1 && transformed[0].data.reading_id === 'EnvironmentalSensor') {
  ok('Transform', `1 record, reading_id="${transformed[0].data.reading_id}"`);
  ok('Fields', `temp=${transformed[0].data.temperatureC} hum=${transformed[0].data.humidity} pres=${transformed[0].data.pressure}`);
} else {
  bad('Transform', `expected 1 record, got ${transformed.length}`);
}

// 3. Create record (first run)
console.log('\n3. Create record (first bridge run)');
const createData = {
  ...transformed[0].data,
};
let recordId;
try {
  const resp = await fetch(`${BASE}/collections/${COL}`, {
    method: 'POST', headers: h, body: JSON.stringify({ data: createData })
  });
  const body = await resp.json();
  recordId = body.id;
  if (resp.ok && recordId) {
    ok('POST create', `id=${recordId}`);
  } else {
    bad('POST create', `HTTP ${resp.status}: ${JSON.stringify(body).substring(0, 200)}`);
  }
} catch (e) {
  bad('POST create', e.message);
}

// 4. Find by reading_id (upsert lookup)
console.log('\n4. Upsert lookup (filter by reading_id)');
try {
  const resp = await fetch(
    `${BASE}/collections/${COL}?filter[reading_id]=EnvironmentalSensor&limit=1`,
    { headers: h }
  );
  const body = await resp.json();
  const records = body.records || body.data || body;
  if (Array.isArray(records) && records.some(r => String(r.id) === String(recordId))) {
    ok('Filter', `found record id=${recordId}`);
  } else {
    bad('Filter', `record ${recordId} not in results: ${JSON.stringify(records?.map(r => r.id))}`);
  }
} catch (e) {
  bad('Filter', e.message);
}

// 5. Update record (subsequent polls)
console.log('\n5. Update record (subsequent polls)');
try {
  const resp = await fetch(`${BASE}/collections/${COL}/${recordId}`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ data: {
      temperatureC: 23.1, humidity: 52.7, pressure: 1014.8,
    }})
  });
  if (resp.ok) {
    ok('PATCH update', 'temperatureC→23.1, humidity→52.7');
  } else {
    bad('PATCH update', `HTTP ${resp.status}`);
  }
} catch (e) {
  bad('PATCH update', e.message);
}

// 6. Read back and verify
console.log('\n6. Verify updated values');
try {
  const resp = await fetch(`${BASE}/collections/${COL}/${recordId}`, { headers: h });
  const body = await resp.json();
  const d = body.data;
  if (d.temperatureC === 23.1 && d.humidity === 52.7) {
    ok('GET verify', `temp=${d.temperatureC} hum=${d.humidity} pres=${d.pressure}`);
  } else {
    bad('GET verify', `unexpected values: ${JSON.stringify(d)}`);
  }
} catch (e) {
  bad('GET verify', e.message);
}

// 7. Cleanup
console.log('\n7. Cleanup');
try {
  const resp = await fetch(`${BASE}/collections/${COL}/${recordId}`, { method: 'DELETE', headers: h });
  if (resp.ok || resp.status === 204) {
    ok('DELETE', `removed record ${recordId}`);
  } else {
    bad('DELETE', `HTTP ${resp.status}`);
  }
} catch (e) {
  bad('DELETE', e.message);
}

// Summary
console.log('\n' + '='.repeat(45));
if (failures === 0) {
  console.log('✅ All pipeline steps passed — Pi bridge is ready!');
  console.log('\nOn the Pi, just:');
  console.log('  cd ~/Desktop/kinabridge');
  console.log('  git pull');
  console.log('  bash update-pi.sh');
  console.log('  npm start');
} else {
  console.log(`❌ ${failures} step(s) failed — fix before deploying`);
  process.exit(1);
}
console.log('');
