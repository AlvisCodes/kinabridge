#!/usr/bin/env node
import { createTokenProvider } from './src/kinabaseAuth.js';
import config from './src/config.js';
import fetch from 'node-fetch';

const tp = createTokenProvider();
const token = await tp();

// Find the existing EnvironmentalSensor record with full data
const findUrl = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}?filter[reading_id]=EnvironmentalSensor&limit=1`;
const findResp = await fetch(findUrl, {
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
});
const findBody = await findResp.json();
const records = findBody.records || findBody.data || findBody;
console.log('Full record data:', JSON.stringify(records?.[0], null, 2));
console.log('Field names:', Object.keys(records?.[0] || {}));

if (!records?.length) {
  console.log('❌ No EnvironmentalSensor record found!');
  process.exit(1);
}

const recordId = records[0].id;
console.log('Using record ID:', recordId);

// Ingest test telemetry data
const now = new Date().toISOString();
const ingestPayload = {
  mode: 'FUTURE_FACING',
  records: [{
    id: String(recordId),
    changes: [{
      timestamp: now,
      data: {
        temperatureC: 296.5,
        humidity: 45.2,
        pressure: 1013.0,
      },
    }],
  }],
};

const ingestUrl = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}/ingest`;
console.log('Ingesting to:', ingestUrl);
console.log('Payload:', JSON.stringify(ingestPayload, null, 2));

const ingestResp = await fetch(ingestUrl, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
  body: JSON.stringify(ingestPayload),
});

console.log('Ingest status:', ingestResp.status);
const ingestBody = await ingestResp.text();
console.log('Ingest response:', ingestBody.substring(0, 500));

if (ingestResp.ok) {
  console.log('\n✅ Ingest succeeded — check the telemetry charts in Kinabase now');
} else {
  console.log('\n❌ Ingest failed — check the response above');
}
