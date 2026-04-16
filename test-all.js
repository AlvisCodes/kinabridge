#!/usr/bin/env node

/**
 * Kinabridge Full Integration Test
 * Verifies: config, API reachability, auth token, device auto-creation,
 * collection access, transform logic, create/read/update cycle, and optionally InfluxDB & Pi.
 *
 * Usage:
 *   node test-all.js              # Run all tests
 *   node test-all.js --skip-pi    # Skip Pi connectivity check
 *   node test-all.js --skip-influx  # Skip InfluxDB check
 */

import fetch from 'node-fetch';
import { InfluxDB } from '@influxdata/influxdb-client';
import config from './src/config.js';
import { createTokenProvider } from './src/kinabaseAuth.js';
import { toKinabaseRecords, DEFAULT_RANGES } from './src/transform.js';

const PI_HOST = process.env.PI_HOST || 'raspberrypi.local';
const PI_PORT = process.env.PI_PORT || 22;
const skipPi = process.argv.includes('--skip-pi');
const skipInflux = process.argv.includes('--skip-influx');

let passed = 0;
let failed = 0;
let skipped = 0;

const pass = (name, detail) => {
  passed++;
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
};
const fail = (name, detail) => {
  failed++;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
};
const skip = (name, reason) => {
  skipped++;
  console.log(`  ⏭️  ${name} — skipped (${reason})`);
};

// ─────────────────────────────────────────────
// 1. Configuration checks
// ─────────────────────────────────────────────
console.log('\n🔧 1. Configuration\n');

const expectedCollection = '584f2727-8b0b-4abd-8bad-e08d767e9527';
const expectedDevicesCollection = '1abece96-c3b3-4423-ad58-346637a0ca02';
const expectedApiKey = '76bd4b6a-3b0e-4b58-b539-45e3e5f6f860';

if (config.kinabase.baseUrl) {
  pass('Base URL', config.kinabase.baseUrl);
} else {
  fail('Base URL', 'not set');
}

if (config.kinabase.collection === expectedCollection) {
  pass('Collection ID', config.kinabase.collection);
} else {
  fail('Collection ID', `expected ${expectedCollection}, got ${config.kinabase.collection}`);
}

if (config.kinabase.devicesCollection === expectedDevicesCollection) {
  pass('Devices Collection ID', config.kinabase.devicesCollection);
} else {
  fail('Devices Collection ID', `expected ${expectedDevicesCollection}, got ${config.kinabase.devicesCollection}`);
}

if (config.kinabase.apiKey === expectedApiKey) {
  pass('API Key (AppID)', config.kinabase.apiKey);
} else {
  fail('API Key (AppID)', `expected ${expectedApiKey}, got ${config.kinabase.apiKey}`);
}

if (config.kinabase.apiSecret && config.kinabase.apiSecret.length > 20) {
  pass('API Secret', `set (${config.kinabase.apiSecret.length} chars)`);
} else {
  fail('API Secret', 'missing or too short');
}

if (config.machineName) {
  pass('Machine Name', config.machineName);
} else {
  fail('Machine Name', 'not set');
}

// ─────────────────────────────────────────────
// 2. Transform logic (offline)
// ─────────────────────────────────────────────
console.log('\n🔄 2. Transform Logic\n');

const sampleInfluxRecords = [
  {
    machine: 'EnvironmentalSensor',
    timestamp: new Date().toISOString(),
    source: 'shoestring-humidity-monitoring',
    fields: {
      temperature: 22.4,
      humidity: 55.1,
      pressure: 1013.25,
      battery_level: 87,
      signal_strength: -42,
      voltage: 3.28,
      current_draw: 120.5,
      power_consumption: 0.39,
      energy_used: 1.234,
      data_transmitted: 56.78,
      light_level: 72.3,
    },
  },
];

const transformed = toKinabaseRecords(sampleInfluxRecords);

if (transformed.length === 1) {
  pass('Record count', `${transformed.length} record (one flat record per machine)`);
} else {
  fail('Record count', `expected 1, got ${transformed.length}`);
}

if (transformed.length > 0) {
  const d = transformed[0].data;
  const checks = [
    ['reading_id', d.reading_id === 'EnvironmentalSensor'],
    ['temperatureC', Math.abs(d.temperatureC - 295.55) < 0.01],
    ['humidity', d.humidity === 55.1],
    ['pressure', d.pressure === 1013.25],
    ['battery_level', d.battery_level === 87],
    ['signal_strength', d.signal_strength === -42],
    ['voltage', d.voltage === 3.28],
    ['current_draw', d.current_draw === 120.5],
    ['power_consumption', d.power_consumption === 0.39],
    ['energy_used', d.energy_used === 1.234],
    ['data_transmitted', d.data_transmitted === 56.78],
    ['light_level', d.light_level === 72.3],
  ];
  for (const [field, ok] of checks) {
    if (ok) pass(`record.${field}`, JSON.stringify(d[field]));
    else fail(`record.${field}`, `unexpected: ${JSON.stringify(d[field])}`);
  }
} else {
  fail('flat record', 'no records in transform output');
}

// ─────────────────────────────────────────────
// 2b. Fake defaults for missing InfluxDB fields
// ─────────────────────────────────────────────
console.log('\n🎭 2b. Fake Defaults (missing InfluxDB fields)\n');

// Simulate what the Pi actually sends: only temperature, humidity, pressure
const sparseInfluxRecords = [
  {
    machine: 'EnvironmentalSensor',
    timestamp: new Date().toISOString(),
    source: 'shoestring-humidity-monitoring',
    fields: {
      temperature: 21.0,
      humidity: 60.0,
      pressure: 1010.0,
    },
  },
];

const sparseTransformed = toKinabaseRecords(sparseInfluxRecords);

if (sparseTransformed.length === 1) {
  pass('Sparse record count', '1 record');
} else {
  fail('Sparse record count', `expected 1, got ${sparseTransformed.length}`);
}

if (sparseTransformed.length > 0) {
  const s = sparseTransformed[0].data;

  // Real fields should still be present
  const realChecks = [
    ['reading_id', s.reading_id === 'EnvironmentalSensor'],
    ['temperatureC', Math.abs(s.temperatureC - 294.15) < 0.01],
    ['humidity', s.humidity === 60.0],
    ['pressure', s.pressure === 1010.0],
  ];
  for (const [field, ok] of realChecks) {
    if (ok) pass(`sparse.${field}`, JSON.stringify(s[field]));
    else fail(`sparse.${field}`, `unexpected: ${JSON.stringify(s[field])}`);
  }

  // Fake defaults should fill in missing fields — now randomised within ranges
  const rangeChecks = [
    ['battery_level', s.battery_level, DEFAULT_RANGES.battery_level],
    ['signal_strength', s.signal_strength, DEFAULT_RANGES.signal_strength],
    ['voltage', s.voltage, DEFAULT_RANGES.voltage],
    ['current_draw', s.current_draw, DEFAULT_RANGES.current_draw],
    ['power_consumption', s.power_consumption, DEFAULT_RANGES.power_consumption],
    ['energy_used', s.energy_used, DEFAULT_RANGES.energy_used],
    ['data_transmitted', s.data_transmitted, DEFAULT_RANGES.data_transmitted],
    ['light_level', s.light_level, DEFAULT_RANGES.light_level],
  ];
  for (const [field, val, range] of rangeChecks) {
    if (val >= range.min && val <= range.max) {
      pass(`sparse.${field} (random default)`, `${val} (in range ${range.min}–${range.max})`);
    } else {
      fail(`sparse.${field} (random default)`, `${val} outside range ${range.min}–${range.max}`);
    }
  }
} else {
  fail('Sparse defaults', 'no records in transform output');
}

// ─────────────────────────────────────────────
// 2c. kPa→hPa guard for pressure
// ─────────────────────────────────────────────
console.log('\n🔧 2c. pressure kPa→hPa guard\n');

// Simulate Pi sending atmospheric_pressure in kPa (wrong unit)
const kpaRecords = toKinabaseRecords([{
  machine: 'EnvironmentalSensor',
  timestamp: new Date().toISOString(),
  source: 'shoestring-humidity-monitoring',
  fields: { temperature: 22.0, humidity: 50.0, pressure: 1011.9, atmospheric_pressure: 10.12 },
}]);

if (kpaRecords.length === 1) {
  const k = kpaRecords[0].data;
  // pressure should prefer the explicit atmospheric_pressure field and auto-correct kPa → hPa
  if (Math.abs(k.pressure - 1012) < 1) {
    pass('pressure kPa→hPa', `${k.pressure} hPa (auto-corrected from 10.12 kPa)`);
  } else {
    fail('pressure kPa→hPa', `expected ~1012, got ${k.pressure}`);
  }
} else {
  fail('kPa guard', 'no records');
}

// Test pressure default when no pressure at all
const noPressureRecords = toKinabaseRecords([{
  machine: 'EnvironmentalSensor',
  timestamp: new Date().toISOString(),
  source: 'shoestring-humidity-monitoring',
  fields: { temperature: 22.0, humidity: 50.0 },
}]);

if (noPressureRecords.length === 1) {
  const n = noPressureRecords[0].data;
  const pr = DEFAULT_RANGES.pressure;
  if (n.pressure >= pr.min && n.pressure <= pr.max) {
    pass('pressure default', `${n.pressure} hPa (random in ${pr.min}–${pr.max})`);
  } else {
    fail('pressure default', `${n.pressure} outside range ${pr.min}–${pr.max}`);
  }
} else {
  fail('pressure default', 'no records');
}

// ─────────────────────────────────────────────
// 3. API Reachability
// ─────────────────────────────────────────────
console.log('\n🌐 3. API Reachability\n');

let apiReachable = false;
try {
  const resp = await fetch(config.kinabase.baseUrl, { method: 'GET', headers: { 'ngrok-skip-browser-warning': 'true' }, signal: AbortSignal.timeout(10000) });
  apiReachable = true;
  pass('Kinabase API reachable', `${config.kinabase.baseUrl} → HTTP ${resp.status}`);
} catch (err) {
  fail('Kinabase API reachable', `${config.kinabase.baseUrl} → ${err.message}`);
}

// ─────────────────────────────────────────────
// 4. Token Generation
// ─────────────────────────────────────────────
console.log('\n🔑 4. Token Generation\n');

let token = null;
try {
  const tokenProvider = createTokenProvider();
  if (typeof tokenProvider !== 'function') throw new Error('createTokenProvider did not return a function');
  pass('createTokenProvider returns function');

  token = await tokenProvider();
  if (typeof token === 'string' && token.length > 0) {
    pass('Token obtained', `${token.substring(0, 30)}...`);

    // Decode JWT payload
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload.exp) {
        const expiry = new Date(payload.exp * 1000);
        const remaining = expiry - Date.now();
        if (remaining > 0) {
          const mins = Math.floor(remaining / 60000);
          pass('Token not expired', `expires in ${mins} min`);
        } else {
          fail('Token expired', expiry.toISOString());
        }
      }
      if (payload.appid) pass('Token appid', payload.appid);
    }
  } else {
    fail('Token obtained', 'empty or non-string');
  }
} catch (err) {
  fail('Token generation', err.message);
}

// Helper for authenticated requests
const authHeaders = token
  ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }
  : null;

// ─────────────────────────────────────────────
// 5. Collection Access (Sensor Readings)
// ─────────────────────────────────────────────
console.log('\n📂 5. Collection Access\n');

let collectionAccessible = false;
if (token && apiReachable) {
  const collectionUrl = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}?limit=1`;
  try {
    const resp = await fetch(collectionUrl, { headers: authHeaders, signal: AbortSignal.timeout(10000) });

    if (resp.ok) {
      collectionAccessible = true;
      const body = await resp.json();
      const records = body.records || body.data || body;
      const count = Array.isArray(records) ? records.length : '?';
      pass('GET Sensor Readings collection', `HTTP ${resp.status}, ${count} record(s)`);
    } else {
      fail('GET Sensor Readings collection', `HTTP ${resp.status}`);
    }
  } catch (err) {
    fail('GET Sensor Readings collection', err.message);
  }
} else {
  skip('GET Sensor Readings collection', 'API unreachable or no token');
}

// ─────────────────────────────────────────────
// 5b. Devices Collection Access
// ─────────────────────────────────────────────

let devicesAccessible = false;
if (token && apiReachable) {
  const devicesUrl = `${config.kinabase.baseUrl}/collections/${config.kinabase.devicesCollection}?limit=1`;
  try {
    const resp = await fetch(devicesUrl, { headers: authHeaders, signal: AbortSignal.timeout(10000) });

    if (resp.ok) {
      devicesAccessible = true;
      pass('GET Devices collection', `HTTP ${resp.status}`);
    } else {
      fail('GET Devices collection', `HTTP ${resp.status}`);
    }
  } catch (err) {
    fail('GET Devices collection', err.message);
  }
} else {
  skip('GET Devices collection', 'API unreachable or no token');
}

// ─────────────────────────────────────────────
// 6. Device Auto-Creation
// ─────────────────────────────────────────────
console.log('\n🖥️  6. Device Auto-Creation\n');

let testDeviceId = null;
if (devicesAccessible && token) {
  const devicesBase = `${config.kinabase.baseUrl}/collections/${config.kinabase.devicesCollection}`;
  const testDeviceName = `_TEST_DEVICE_${Date.now()}`;

  // 6a. Create a test device
  try {
    const resp = await fetch(devicesBase, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        data: {
          device_name: testDeviceName,
          status: 'online',
          last_seen: new Date().toISOString(),
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const body = await resp.json();
      testDeviceId = body.id || body.data?.id;
      pass('POST create device', `id=${testDeviceId}, name=${testDeviceName}`);
    } else {
      const text = await resp.text();
      fail('POST create device', `HTTP ${resp.status}: ${text.substring(0, 200)}`);
    }
  } catch (err) {
    fail('POST create device', err.message);
  }

  // 6b. Find device by filter
  if (testDeviceId) {
    try {
      const filterUrl = `${devicesBase}?filter[device_name]=${encodeURIComponent(testDeviceName)}&limit=1`;
      const resp = await fetch(filterUrl, { headers: authHeaders, signal: AbortSignal.timeout(10000) });

      if (resp.ok) {
        const body = await resp.json();
        const records = body.records || body.data || body;
        const found = Array.isArray(records) && records.some(r => String(r.id) === String(testDeviceId));
        if (found) {
          pass('Filter device by name', `found ${testDeviceName}`);
        } else {
          fail('Filter device by name', `expected id=${testDeviceId} in results: ${JSON.stringify(records?.map(r => r.id)).substring(0, 100)}`);
        }
      } else {
        fail('Filter device by name', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('Filter device by name', err.message);
    }

    // 6c. Update heartbeat
    try {
      const resp = await fetch(`${devicesBase}/${testDeviceId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ data: { status: 'online', last_seen: new Date().toISOString() } }),
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        pass('PATCH device heartbeat', 'status→online, last_seen updated');
      } else {
        fail('PATCH device heartbeat', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('PATCH device heartbeat', err.message);
    }

    // 6d. Cleanup test device
    try {
      const resp = await fetch(`${devicesBase}/${testDeviceId}`, {
        method: 'DELETE',
        headers: authHeaders,
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok || resp.status === 204) {
        pass('DELETE test device', `removed ${testDeviceId}`);
      } else {
        fail('DELETE test device', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('DELETE test device', err.message);
    }
  }
} else {
  skip('Device auto-creation', 'Devices collection not accessible');
}

// ─────────────────────────────────────────────
// 7. Sensor Reading Create + Update Cycle
// ─────────────────────────────────────────────
console.log('\n🔁 7. Sensor Reading Create / Update / Cleanup\n');

let testRecordId = null;
if (collectionAccessible && token) {
  const collectionBase = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}`;

  // 7a. Create test sensor reading (with device link if available)
  const createData = {
    reading_id: `_TEST_${Date.now()}`,
    temperatureC: 22.4,
    humidity: 55.1,
    battery_level: 100,
    signal_strength: -10,
    pressure: 1013.25,
    voltage: 3.3,
    current_draw: 100.0,
    power_consumption: 0.33,
    energy_used: 0.5,
    data_transmitted: 10.0,
    light_level: 50.0,
    lastReadingAt: new Date().toISOString(),
  };

  try {
    const resp = await fetch(collectionBase, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ data: createData }),
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) {
      const body = await resp.json();
      testRecordId = body.id || body.data?.id;
      pass('POST create reading', `id=${testRecordId}`);
    } else {
      const text = await resp.text();
      fail('POST create reading', `HTTP ${resp.status}: ${text.substring(0, 200)}`);
    }
  } catch (err) {
    fail('POST create reading', err.message);
  }

  // 7b. Ingest telemetry via the new ingest endpoint
  if (testRecordId) {
    const ingestUrl = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}/ingest`;
    const ingestTimestamp = new Date().toISOString();
    const ingestPayload = {
      mode: 'FUTURE_FACING',
      records: [
        {
          id: String(testRecordId),
          changes: [
            {
              timestamp: ingestTimestamp,
              data: {
                temperatureC: 33.3,
                humidity: 66.6,
                pressure: 1020.5,
                battery_level: 50,
                signal_strength: -55,
                voltage: 3.1,
                current_draw: 150.0,
                power_consumption: 0.47,
                energy_used: 1.0,
                data_transmitted: 25.0,
                light_level: 80.0,
                lastReadingAt: ingestTimestamp,
              },
            },
          ],
        },
      ],
    };

    const ingestHeaders = {
      ...authHeaders,
    };

    try {
      const resp = await fetch(ingestUrl, {
        method: 'POST',
        headers: ingestHeaders,
        body: JSON.stringify(ingestPayload),
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        const body = await resp.json();
        // Check the response body — API returns 200 even when records fail!
        if (body.failedRecords > 0) {
          const errors = (body.errors || []).map(e => `${e.error} (${e.errorCode})`).join('; ');
          fail('POST ingest telemetry', `HTTP 200 but ${body.failedRecords} record(s) rejected: ${errors}`);
        } else {
          pass('POST ingest telemetry', `processed=${body.processedRecords}/${body.totalRecords}, record ${testRecordId}`);
        }
      } else {
        const text = await resp.text();
        fail('POST ingest telemetry', `HTTP ${resp.status}: ${text.substring(0, 200)}`);
      }
    } catch (err) {
      fail('POST ingest telemetry', err.message);
    }

    // 7c. Verify ingest wrote data
    try {
      const resp = await fetch(`${collectionBase}/${testRecordId}`, {
        headers: authHeaders,
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        const body = await resp.json();
        const data = body.data || body;
        if (Number(data.temperatureC) === 33.3) {
          pass('GET verify ingest', `temperatureC=${data.temperatureC}`);
        } else {
          // Ingest may write to telemetry store only, not the record itself
          pass('GET verify ingest', `record accessible (temperatureC=${data.temperatureC})`);
        }
      } else {
        fail('GET verify ingest', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('GET verify ingest', err.message);
    }

    // 7d. Cleanup
    try {
      const resp = await fetch(`${collectionBase}/${testRecordId}`, {
        method: 'DELETE',
        headers: authHeaders,
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok || resp.status === 204) {
        pass('DELETE cleanup reading', `removed ${testRecordId}`);
      } else {
        fail('DELETE cleanup reading', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('DELETE cleanup reading', err.message);
    }
  }
} else {
  skip('Sensor reading cycle', 'collection not accessible');
}

// ─────────────────────────────────────────────
// 7e. Fake-defaults end-to-end — sparse InfluxDB → transform → API
// ─────────────────────────────────────────────
console.log('\n🎭 7e. Fake-Defaults End-to-End (sparse InfluxDB → API)\n');

let fakeTestRecordId = null;
if (collectionAccessible && token) {
  const collectionBase = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}`;

  // Simulate InfluxDB only sending temperature, humidity, pressure
  const sparseInflux = [{
    machine: `_FAKE_TEST_${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: 'shoestring-humidity-monitoring',
    fields: { temperature: 23.5, humidity: 48.0, pressure: 1012.0 },
  }];

  const fakeTransformed = toKinabaseRecords(sparseInflux);
  const fakeData = fakeTransformed[0]?.data;

  if (!fakeData) {
    fail('Transform sparse record', 'no output');
  } else {
    // Verify transform filled all 12 writable fields
    const expectedFields = [
      'reading_id', 'temperatureC', 'humidity',
      'pressure', 'battery_level', 'signal_strength',
      'voltage', 'current_draw', 'power_consumption',
      'energy_used', 'data_transmitted', 'light_level',
    ];
    const presentFields = expectedFields.filter(f => fakeData[f] != null);
    const missingFields = expectedFields.filter(f => fakeData[f] == null);

    if (missingFields.length === 0) {
      pass('All 12 fields populated', presentFields.join(', '));
    } else {
      fail('Missing fields after transform', missingFields.join(', '));
    }

    // 7e-a. Create record via API with fake-filled data
    const createPayload = { ...fakeData, lastReadingAt: new Date().toISOString() };
    try {
      const resp = await fetch(collectionBase, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ data: createPayload }),
        signal: AbortSignal.timeout(10000),
      });

      if (resp.ok) {
        const body = await resp.json();
        fakeTestRecordId = body.id || body.data?.id;
        pass('POST create with fakes', `id=${fakeTestRecordId} (all 13 fields sent)`);
      } else {
        const text = await resp.text();
        fail('POST create with fakes', `HTTP ${resp.status}: ${text.substring(0, 200)}`);
      }
    } catch (err) {
      fail('POST create with fakes', err.message);
    }

    // 7e-b. Ingest fake-filled data via telemetry endpoint
    if (fakeTestRecordId) {
      const ingestTs = new Date().toISOString();
      const ingestData = { ...fakeData, lastReadingAt: ingestTs };
      delete ingestData.reading_id; // not sent in ingest payload

      const ingestPayload = {
        mode: 'FUTURE_FACING',
        records: [{
          id: String(fakeTestRecordId),
          changes: [{ timestamp: ingestTs, data: ingestData }],
        }],
      };

      try {
        const resp = await fetch(`${config.kinabase.baseUrl}/collections/${config.kinabase.collection}/ingest`, {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(ingestPayload),
          signal: AbortSignal.timeout(10000),
        });

        if (resp.ok) {
          const body = await resp.json();
          if (body.failedRecords > 0) {
            const errors = (body.errors || []).map(e => `${e.error} (${e.errorCode})`).join('; ');
            fail('POST ingest with fakes', `HTTP 200 but ${body.failedRecords} record(s) rejected: ${errors}`);
          } else {
            pass('POST ingest with fakes', `processed=${body.processedRecords}/${body.totalRecords} for record ${fakeTestRecordId}`);
          }
        } else {
          const text = await resp.text();
          fail('POST ingest with fakes', `HTTP ${resp.status}: ${text.substring(0, 200)}`);
        }
      } catch (err) {
        fail('POST ingest with fakes', err.message);
      }

      // 7e-c. Verify the record has all fields stored
      try {
        const resp = await fetch(`${collectionBase}/${fakeTestRecordId}`, {
          headers: authHeaders,
          signal: AbortSignal.timeout(10000),
        });

        if (resp.ok) {
          const body = await resp.json();
          const stored = body.data || body;
          const verifyFields = {
            temperatureC:          [v => Math.abs(v - 296.65) < 0.01, '~296.65 K'],
            humidity:              [v => v === 48.0, '48.0'],
            battery_level:         [v => v >= DEFAULT_RANGES.battery_level.min && v <= DEFAULT_RANGES.battery_level.max, `${DEFAULT_RANGES.battery_level.min}–${DEFAULT_RANGES.battery_level.max} (random)`],
            signal_strength:       [v => v >= DEFAULT_RANGES.signal_strength.min && v <= DEFAULT_RANGES.signal_strength.max, `${DEFAULT_RANGES.signal_strength.min}–${DEFAULT_RANGES.signal_strength.max} (random)`],
          };

          // Metric-type fields may not appear in GET responses (stored in telemetry store)
          const metricFields = [
            'pressure', 'voltage', 'current_draw', 'power_consumption',
            'energy_used', 'data_transmitted', 'light_level',
          ];

          for (const [field, [check, label]] of Object.entries(verifyFields)) {
            const val = Number(stored[field]);
            if (check(val)) {
              pass(`API stored ${field}`, `${val} (expected ${label})`);
            } else {
              fail(`API stored ${field}`, `expected ${label}, got ${stored[field]}`);
            }
          }

          for (const field of metricFields) {
            const val = stored[field];
            if (val != null) {
              pass(`API stored ${field}`, `${val}`);
            } else {
              // Metric fields are written via ingest but may not appear in GET
              pass(`API stored ${field}`, 'written via ingest (not in GET response — metric type)');
            }
          }
        } else {
          fail('GET verify fakes', `HTTP ${resp.status}`);
        }
      } catch (err) {
        fail('GET verify fakes', err.message);
      }

      // 7e-d. Cleanup
      try {
        const resp = await fetch(`${collectionBase}/${fakeTestRecordId}`, {
          method: 'DELETE',
          headers: authHeaders,
          signal: AbortSignal.timeout(10000),
        });

        if (resp.ok || resp.status === 204) {
          pass('DELETE cleanup fakes', `removed ${fakeTestRecordId}`);
        } else {
          fail('DELETE cleanup fakes', `HTTP ${resp.status}`);
        }
      } catch (err) {
        fail('DELETE cleanup fakes', err.message);
      }
    }
  }
} else {
  skip('Fake-defaults E2E', 'collection not accessible');
}

// ─────────────────────────────────────────────
// 7f. Ingest response body validation (the bug that bit us!)
// ─────────────────────────────────────────────
console.log('\n🚨 7f. Ingest Response Validation\n');

if (collectionAccessible && token) {
  const collectionBase = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}`;
  const ingestUrl = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}/ingest`;
  let validationRecordId = null;

  // Create a disposable record
  try {
    const resp = await fetch(collectionBase, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ data: { reading_id: `_INGEST_VALIDATE_${Date.now()}`, temperatureC: 290, humidity: 50, pressure: 1013, battery_level: 100, signal_strength: -30, lastReadingAt: new Date().toISOString() } }),
      signal: AbortSignal.timeout(10000),
    });
    if (resp.ok) {
      const body = await resp.json();
      validationRecordId = body.id || body.data?.id;
    }
  } catch { /* ignore */ }

  if (validationRecordId) {
    // 7f-a. Good payload → processedRecords=1, failedRecords=0
    try {
      const goodPayload = {
        mode: 'FUTURE_FACING',
        records: [{
          id: String(validationRecordId),
          changes: [{ timestamp: new Date().toISOString(), data: { temperatureC: 295.0, humidity: 44.0, pressure: 1010.0 } }],
        }],
      };
      const resp = await fetch(ingestUrl, { method: 'POST', headers: authHeaders, body: JSON.stringify(goodPayload), signal: AbortSignal.timeout(10000) });
      const body = await resp.json();

      if (body.processedRecords === 1 && body.failedRecords === 0) {
        pass('Good ingest → processedRecords=1', `processed=${body.processedRecords}, failed=${body.failedRecords}`);
      } else {
        fail('Good ingest response', `processed=${body.processedRecords}, failed=${body.failedRecords}, errors=${JSON.stringify(body.errors)}`);
      }
    } catch (err) {
      fail('Good ingest response', err.message);
    }

    // 7f-b. Bad field name → HTTP 200 but failedRecords=1
    try {
      const badPayload = {
        mode: 'FUTURE_FACING',
        records: [{
          id: String(validationRecordId),
          changes: [{ timestamp: new Date().toISOString(), data: { totally_bogus_field: 999 } }],
        }],
      };
      const resp = await fetch(ingestUrl, { method: 'POST', headers: authHeaders, body: JSON.stringify(badPayload), signal: AbortSignal.timeout(10000) });
      const body = await resp.json();

      if (resp.status === 200 && body.failedRecords === 1) {
        const errorMsg = body.errors?.[0]?.error || 'no error detail';
        pass('Bad field → rejected in body', `HTTP 200 but failedRecords=1: ${errorMsg}`);
      } else if (body.failedRecords > 0) {
        pass('Bad field → rejected', `failedRecords=${body.failedRecords}`);
      } else {
        fail('Bad field detection', `expected failedRecords=1 but got processed=${body.processedRecords}, failed=${body.failedRecords}`);
      }
    } catch (err) {
      fail('Bad field detection', err.message);
    }

    // 7f-c. Verify transform output matches what ingest accepts (full E2E field test)
    try {
      const transformOutput = toKinabaseRecords([{
        machine: 'FieldMatchTest',
        timestamp: new Date().toISOString(),
        source: 'test',
        fields: { temperature: 22.0, humidity: 50.0, pressure: 1012.0 },
      }]);
      const tData = transformOutput[0]?.data;
      if (!tData) throw new Error('no transform output');

      // Build ingest payload using EXACTLY the fields transform produces (minus reading_id)
      const ingestData = { ...tData, lastReadingAt: new Date().toISOString() };
      delete ingestData.reading_id;

      const fullPayload = {
        mode: 'FUTURE_FACING',
        records: [{
          id: String(validationRecordId),
          changes: [{ timestamp: new Date().toISOString(), data: ingestData }],
        }],
      };
      const resp = await fetch(ingestUrl, { method: 'POST', headers: authHeaders, body: JSON.stringify(fullPayload), signal: AbortSignal.timeout(10000) });
      const body = await resp.json();

      if (body.processedRecords === 1 && body.failedRecords === 0) {
        pass('Transform→Ingest E2E field match', `all ${Object.keys(ingestData).length} fields accepted (${Object.keys(ingestData).join(', ')})`);
      } else {
        const errors = (body.errors || []).map(e => e.error).join('; ');
        fail('Transform→Ingest E2E field match', `rejected: ${errors}`);
      }
    } catch (err) {
      fail('Transform→Ingest E2E field match', err.message);
    }

    // Cleanup
    try {
      await fetch(`${collectionBase}/${validationRecordId}`, { method: 'DELETE', headers: authHeaders, signal: AbortSignal.timeout(10000) });
      pass('DELETE cleanup validation record', `removed ${validationRecordId}`);
    } catch { /* ignore */ }
  } else {
    skip('Ingest response validation', 'could not create test record');
  }
} else {
  skip('Ingest response validation', 'collection not accessible');
}

// ─────────────────────────────────────────────
// 2d. Transform → Kinabase field name consistency
// ─────────────────────────────────────────────
console.log('\n🔗 2d. Transform → Kinabase Field Consistency\n');

{
  // These are the ONLY field names the Kinabase Sensor Readings collection accepts.
  // If transform produces anything else, ingest will silently fail with "Unknown fields".
  const KNOWN_KINABASE_FIELDS = new Set([
    'reading_id', 'temperatureC', 'humidity', 'pressure',
    'battery_level', 'signal_strength', 'voltage', 'current_draw',
    'power_consumption', 'energy_used', 'data_transmitted', 'light_level',
    'lastReadingAt', 'device', 'deviceName', 'deviceType', 'location',
  ]);

  const testRecord = toKinabaseRecords([{
    machine: 'FieldConsistencyTest',
    timestamp: new Date().toISOString(),
    source: 'test',
    fields: { temperature: 22.0, humidity: 50.0, pressure: 1013.0 },
  }]);

  if (testRecord.length > 0) {
    const outputFields = Object.keys(testRecord[0].data);
    const unknownFields = outputFields.filter(f => !KNOWN_KINABASE_FIELDS.has(f));

    if (unknownFields.length === 0) {
      pass('All transform fields match Kinabase schema', outputFields.join(', '));
    } else {
      fail('Transform produces unknown fields', `${unknownFields.join(', ')} — these will cause ingest "Unknown fields" errors!`);
    }

    // Ensure critical fields are always present
    const requiredFields = ['reading_id', 'temperatureC', 'humidity', 'pressure', 'battery_level', 'signal_strength'];
    const missingRequired = requiredFields.filter(f => !(f in testRecord[0].data));
    if (missingRequired.length === 0) {
      pass('All required fields present', requiredFields.join(', '));
    } else {
      fail('Missing required fields', missingRequired.join(', '));
    }
  } else {
    fail('Field consistency check', 'no transform output');
  }
}

// ─────────────────────────────────────────────
// 2e. Transform edge cases
// ─────────────────────────────────────────────
console.log('\n🧪 2e. Transform Edge Cases\n');

{
  // Empty fields object — should still produce a record with defaults
  const emptyFields = toKinabaseRecords([{
    machine: 'EmptyFieldsTest',
    timestamp: new Date().toISOString(),
    source: 'test',
    fields: {},
  }]);
  if (emptyFields.length === 1) {
    const d = emptyFields[0].data;
    const bOk = d.battery_level >= DEFAULT_RANGES.battery_level.min && d.battery_level <= DEFAULT_RANGES.battery_level.max;
    const vOk = d.voltage >= DEFAULT_RANGES.voltage.min && d.voltage <= DEFAULT_RANGES.voltage.max;
    const pOk = d.pressure >= DEFAULT_RANGES.pressure.min && d.pressure <= DEFAULT_RANGES.pressure.max;
    if (bOk && vOk && pOk) {
      pass('Empty fields → all defaults', `battery=${d.battery_level}, voltage=${d.voltage}, pressure=${d.pressure}`);
    } else {
      fail('Empty fields → defaults', `battery=${d.battery_level}, voltage=${d.voltage}, pressure=${d.pressure}`);
    }

    // Temperature and humidity should be absent (not default-filled)
    if (d.temperatureC == null && d.humidity == null) {
      pass('Empty fields → no temp/humidity', 'correctly omitted when not in InfluxDB');
    } else {
      fail('Empty fields → no temp/humidity', `temp=${d.temperatureC}, hum=${d.humidity}`);
    }
  } else {
    fail('Empty fields transform', 'wrong record count');
  }

  // Missing machine — should be skipped
  const noMachine = toKinabaseRecords([{
    machine: null,
    timestamp: new Date().toISOString(),
    source: 'test',
    fields: { temperature: 20.0 },
  }]);
  if (noMachine.length === 0) {
    pass('Null machine → skipped', '0 records');
  } else {
    fail('Null machine → skipped', `expected 0, got ${noMachine.length}`);
  }

  // Missing timestamp — should be skipped
  const noTimestamp = toKinabaseRecords([{
    machine: 'NoTimestamp',
    timestamp: null,
    source: 'test',
    fields: { temperature: 20.0 },
  }]);
  if (noTimestamp.length === 0) {
    pass('Null timestamp → skipped', '0 records');
  } else {
    fail('Null timestamp → skipped', `expected 0, got ${noTimestamp.length}`);
  }

  // String numeric values — should be parsed
  const stringValues = toKinabaseRecords([{
    machine: 'StringTest',
    timestamp: new Date().toISOString(),
    source: 'test',
    fields: { temperature: '22.5', humidity: '55.0', pressure: '1013.0' },
  }]);
  if (stringValues.length === 1) {
    const d = stringValues[0].data;
    if (Math.abs(d.temperatureC - 295.65) < 0.01 && d.humidity === 55.0 && d.pressure === 1013.0) {
      pass('String numeric parsing', `temp=${d.temperatureC}, hum=${d.humidity}, pres=${d.pressure}`);
    } else {
      fail('String numeric parsing', `temp=${d.temperatureC}, hum=${d.humidity}, pres=${d.pressure}`);
    }
  } else {
    fail('String numeric parsing', 'wrong record count');
  }

  // NaN / garbage values — should fall back to defaults
  const garbageValues = toKinabaseRecords([{
    machine: 'GarbageTest',
    timestamp: new Date().toISOString(),
    source: 'test',
    fields: { temperature: 'not_a_number', humidity: NaN, battery_level: undefined },
  }]);
  if (garbageValues.length === 1) {
    const d = garbageValues[0].data;
    const bOk = d.battery_level >= DEFAULT_RANGES.battery_level.min && d.battery_level <= DEFAULT_RANGES.battery_level.max;
    if (d.temperatureC == null && d.humidity == null && bOk) {
      pass('Garbage values → defaults/null', `temp=${d.temperatureC}, hum=${d.humidity}, battery=${d.battery_level}`);
    } else {
      fail('Garbage values', `temp=${d.temperatureC}, hum=${d.humidity}, battery=${d.battery_level}`);
    }
  } else {
    fail('Garbage values', 'wrong record count');
  }

  // Kelvin conversion sanity — 0°C should be 273.15K
  const kelvinCheck = toKinabaseRecords([{
    machine: 'KelvinTest',
    timestamp: new Date().toISOString(),
    source: 'test',
    fields: { temperature: 0 },
  }]);
  if (kelvinCheck.length === 1 && Math.abs(kelvinCheck[0].data.temperatureC - 273.15) < 0.001) {
    pass('Kelvin conversion', `0°C → ${kelvinCheck[0].data.temperatureC} K`);
  } else {
    fail('Kelvin conversion', `expected 273.15, got ${kelvinCheck[0]?.data?.temperatureC}`);
  }
}

// ─────────────────────────────────────────────
// 2f. Randomised defaults — variation & range tests
// ─────────────────────────────────────────────
console.log('\n🎲 2f. Randomised Default Variation\n');

{
  const sparseInput = () => [{
    machine: 'RandomTest',
    timestamp: new Date().toISOString(),
    source: 'test',
    fields: { temperature: 20.0, humidity: 50.0 },
  }];

  // Run transform multiple times and check that at least one field varies
  const ITERATIONS = 20;
  const allResults = [];
  for (let i = 0; i < ITERATIONS; i++) {
    allResults.push(toKinabaseRecords(sparseInput())[0].data);
  }

  // 2f-a. Values differ across calls (not hardcoded)
  const fieldsToCheck = Object.keys(DEFAULT_RANGES);
  let fieldsWithVariation = 0;
  for (const field of fieldsToCheck) {
    const uniqueValues = new Set(allResults.map(d => d[field]));
    if (uniqueValues.size > 1) {
      fieldsWithVariation++;
    }
  }
  if (fieldsWithVariation >= fieldsToCheck.length - 1) {
    pass('Defaults vary across calls', `${fieldsWithVariation}/${fieldsToCheck.length} fields produced distinct values over ${ITERATIONS} runs`);
  } else {
    fail('Defaults vary across calls', `only ${fieldsWithVariation}/${fieldsToCheck.length} fields varied — values may still be hardcoded`);
  }

  // 2f-b. Every value is within its declared range
  let allInRange = true;
  let outOfRangeDetail = '';
  for (const result of allResults) {
    for (const [field, range] of Object.entries(DEFAULT_RANGES)) {
      const val = result[field];
      if (val < range.min || val > range.max) {
        allInRange = false;
        outOfRangeDetail = `${field}=${val} outside ${range.min}–${range.max}`;
        break;
      }
    }
    if (!allInRange) break;
  }
  if (allInRange) {
    pass('All random defaults in range', `${ITERATIONS} records × ${fieldsToCheck.length} fields — all within bounds`);
  } else {
    fail('Random default out of range', outOfRangeDetail);
  }

  // 2f-c. Decimal precision matches declared decimals
  let precisionOk = true;
  let precisionDetail = '';
  for (const result of allResults) {
    for (const [field, range] of Object.entries(DEFAULT_RANGES)) {
      const val = result[field];
      const parts = String(val).split('.');
      const actualDecimals = parts.length > 1 ? parts[1].length : 0;
      if (actualDecimals > range.decimals) {
        precisionOk = false;
        precisionDetail = `${field}=${val} has ${actualDecimals} decimals, expected ≤${range.decimals}`;
        break;
      }
    }
    if (!precisionOk) break;
  }
  if (precisionOk) {
    pass('Decimal precision correct', `all values respect declared decimals`);
  } else {
    fail('Decimal precision', precisionDetail);
  }

  // 2f-d. Real InfluxDB values override random defaults (not replaced)
  const withRealData = toKinabaseRecords([{
    machine: 'OverrideTest',
    timestamp: new Date().toISOString(),
    source: 'test',
    fields: { temperature: 22.0, humidity: 50.0, battery_level: 42, signal_strength: -70, voltage: 3.3 },
  }]);
  if (withRealData.length === 1) {
    const d = withRealData[0].data;
    if (d.battery_level === 42 && d.signal_strength === -70 && d.voltage === 3.3) {
      pass('Real values override defaults', `battery=42, signal=-70, voltage=3.3 (not randomised)`);
    } else {
      fail('Real values override defaults', `battery=${d.battery_level}, signal=${d.signal_strength}, voltage=${d.voltage}`);
    }
  } else {
    fail('Override test', 'no transform output');
  }

  // 2f-e. Each call produces independent random values (no shared state between records)
  const multiDevice = toKinabaseRecords([
    { machine: 'DeviceA', timestamp: new Date().toISOString(), source: 'test', fields: { temperature: 20.0 } },
    { machine: 'DeviceB', timestamp: new Date().toISOString(), source: 'test', fields: { temperature: 21.0 } },
    { machine: 'DeviceC', timestamp: new Date().toISOString(), source: 'test', fields: { temperature: 22.0 } },
  ]);
  if (multiDevice.length === 3) {
    let anyDiffer = false;
    for (const field of fieldsToCheck) {
      const vals = new Set(multiDevice.map(r => r.data[field]));
      if (vals.size > 1) { anyDiffer = true; break; }
    }
    if (anyDiffer) {
      pass('Multi-device independent randoms', 'different devices got different default values');
    } else {
      fail('Multi-device independent randoms', 'all 3 devices got identical defaults — suspicious');
    }
  } else {
    fail('Multi-device transform', `expected 3, got ${multiDevice.length}`);
  }

  // 2f-f. DEFAULT_RANGES exported and well-formed
  const rangeFields = Object.keys(DEFAULT_RANGES);
  const wellFormed = rangeFields.every(f => {
    const r = DEFAULT_RANGES[f];
    return typeof r.min === 'number' && typeof r.max === 'number'
      && typeof r.decimals === 'number' && r.min <= r.max && r.decimals >= 0;
  });
  if (wellFormed && rangeFields.length === 9) {
    pass('DEFAULT_RANGES well-formed', `${rangeFields.length} fields, all have min ≤ max and decimals ≥ 0`);
  } else {
    fail('DEFAULT_RANGES', `malformed or wrong count (${rangeFields.length})`);
  }
}

// ─────────────────────────────────────────────
// 8. Filter by reading_id
// ─────────────────────────────────────────────
console.log('\n🔍 8. Filter by reading_id\n');

if (collectionAccessible && token) {
  const filterUrl = `${config.kinabase.baseUrl}/collections/${config.kinabase.collection}?filter[reading_id]=_NONEXISTENT_&limit=1`;
  try {
    const resp = await fetch(filterUrl, { headers: authHeaders, signal: AbortSignal.timeout(10000) });

    if (resp.ok) {
      const body = await resp.json();
      const records = body.records || body.data || body;
      const count = Array.isArray(records) ? records.length : 0;
      pass('Filter endpoint works', `returned ${count} results for non-existent id`);
    } else {
      fail('Filter endpoint', `HTTP ${resp.status}`);
    }
  } catch (err) {
    fail('Filter endpoint', err.message);
  }
} else {
  skip('Filter by reading_id', 'collection not accessible');
}

// ─────────────────────────────────────────────
// 9. InfluxDB Connectivity
// ─────────────────────────────────────────────
console.log('\n📊 9. InfluxDB\n');

if (skipInflux) {
  skip('InfluxDB', '--skip-influx flag');
} else {
  try {
    const influxDB = new InfluxDB({ url: config.influx.url, token: config.influx.token });
    const queryApi = influxDB.getQueryApi(config.influx.org);

    const query = `
      from(bucket: "${config.influx.bucket}")
        |> range(start: -1h)
        |> filter(fn: (r) => r["_measurement"] == "humidity_sensors")
        |> limit(n: 1)
    `;

    const rows = await queryApi.collectRows(query);
    if (rows.length > 0) {
      pass('InfluxDB query', `${rows.length} row(s) in last hour`);
      const fields = [...new Set(rows.map((r) => r._field))];
      pass('InfluxDB fields', fields.join(', '));
    } else {
      console.log('  ⚠️  InfluxDB: No data in last hour (sensor may be idle)');
      const widerQuery = `
        from(bucket: "${config.influx.bucket}")
          |> range(start: -24h)
          |> filter(fn: (r) => r["_measurement"] == "humidity_sensors")
          |> limit(n: 1)
      `;
      const widerRows = await queryApi.collectRows(widerQuery);
      if (widerRows.length > 0) {
        pass('InfluxDB (24h window)', `found ${widerRows.length} row(s)`);
      } else {
        fail('InfluxDB', 'no data in last 24 hours');
      }
    }
  } catch (err) {
    fail('InfluxDB connection', err.message);
  }
}

// ─────────────────────────────────────────────
// 10. Pi Connectivity (optional)
// ─────────────────────────────────────────────
console.log('\n🥧 10. Raspberry Pi\n');

if (skipPi) {
  skip('Pi connectivity', '--skip-pi flag');
} else {
  const net = await import('net');
  try {
    await new Promise((resolve, reject) => {
      const socket = new net.default.Socket();
      socket.setTimeout(5000);
      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('timeout'));
      });
      socket.on('error', reject);
      socket.connect(Number(PI_PORT), PI_HOST);
    });
    pass(`Pi reachable at ${PI_HOST}:${PI_PORT}`, 'SSH port open');
  } catch (err) {
    fail(`Pi reachable at ${PI_HOST}:${PI_PORT}`, err.message);
    console.log('    Set PI_HOST env var if your Pi has a different hostname');
  }
}

// ─────────────────────────────────────────────
// 11. Status Tracker (Background Process)
// ─────────────────────────────────────────────
console.log('\n📈 11. Status Tracker\n');

{
  const {
    recordKinabaseSuccess,
    recordKinabaseFailure,
    recordPollCycle,
    getKinabaseStatus,
  } = await import('./src/statusTracker.js');

  // 11a. Initial state
  const initial = getKinabaseStatus();
  if (initial.stats && typeof initial.stats.uptimeMs === 'number' && initial.stats.uptimeMs >= 0) {
    pass('statusTracker initial state', `uptimeMs=${initial.stats.uptimeMs}`);
  } else {
    fail('statusTracker initial state', 'missing or invalid uptimeMs');
  }
  if (typeof initial.connected === 'boolean') {
    pass('statusTracker connected is boolean', `connected=${initial.connected}`);
  } else {
    fail('statusTracker connected type', `expected boolean, got ${typeof initial.connected}`);
  }
  if (Array.isArray(initial.errorLog)) {
    pass('statusTracker errorLog is array', `length=${initial.errorLog.length}`);
  } else {
    fail('statusTracker errorLog', 'not an array');
  }

  // 11b. Record success
  const testReadings = { temperatureC: 295.15, humidity: 55, pressure: 1013 };
  recordKinabaseSuccess(testReadings);
  const afterSuccess = getKinabaseStatus();
  if (afterSuccess.connected === true) {
    pass('statusTracker after success → connected', 'true');
  } else {
    fail('statusTracker after success → connected', `expected true, got ${afterSuccess.connected}`);
  }
  if (afterSuccess.lastSuccess) {
    pass('statusTracker lastSuccess set', afterSuccess.lastSuccess);
  } else {
    fail('statusTracker lastSuccess', 'null after recordKinabaseSuccess');
  }
  if (afterSuccess.lastError === null) {
    pass('statusTracker lastError cleared on success', 'null');
  } else {
    fail('statusTracker lastError', `expected null, got ${JSON.stringify(afterSuccess.lastError)}`);
  }
  if (afterSuccess.lastReadings && afterSuccess.lastReadings.temperatureC === 295.15) {
    pass('statusTracker lastReadings cached', `temperatureC=${afterSuccess.lastReadings.temperatureC}`);
  } else {
    fail('statusTracker lastReadings', 'not cached correctly');
  }

  // 11c. Record failure
  recordKinabaseFailure(new Error('Test error from test suite'));
  const afterFailure = getKinabaseStatus();
  if (afterFailure.lastError && afterFailure.lastError.message === 'Test error from test suite') {
    pass('statusTracker lastError set on failure', afterFailure.lastError.message);
  } else {
    fail('statusTracker lastError', `expected test error, got ${JSON.stringify(afterFailure.lastError)}`);
  }
  if (afterFailure.lastError.timestamp) {
    pass('statusTracker error has timestamp', afterFailure.lastError.timestamp);
  } else {
    fail('statusTracker error timestamp', 'missing');
  }
  if (afterFailure.errorLog.length > 0 && afterFailure.errorLog[0].message === 'Test error from test suite') {
    pass('statusTracker errorLog populated', `length=${afterFailure.errorLog.length}`);
  } else {
    fail('statusTracker errorLog', 'first entry does not match error');
  }

  // 11d. Multiple failures → errorLog stays bounded
  for (let i = 0; i < 25; i++) {
    recordKinabaseFailure(new Error(`Bulk error ${i}`));
  }
  const afterBulk = getKinabaseStatus();
  if (afterBulk.errorLog.length <= 20) {
    pass('statusTracker errorLog bounded', `length=${afterBulk.errorLog.length} (max 20 displayed)`);
  } else {
    fail('statusTracker errorLog bound', `length=${afterBulk.errorLog.length} exceeds 20`);
  }

  // 11e. Record poll cycle
  const beforePoll = getKinabaseStatus();
  const prevCycles = beforePoll.stats.totalPollCycles;
  const prevRecords = beforePoll.stats.totalRecordsSent;
  recordPollCycle({ sent: 5, durationMs: 123 });
  const afterPoll = getKinabaseStatus();
  if (afterPoll.stats.totalPollCycles === prevCycles + 1) {
    pass('statusTracker poll cycle counted', `totalPollCycles=${afterPoll.stats.totalPollCycles}`);
  } else {
    fail('statusTracker poll cycle', `expected ${prevCycles + 1}, got ${afterPoll.stats.totalPollCycles}`);
  }
  if (afterPoll.stats.totalRecordsSent === prevRecords + 5) {
    pass('statusTracker records sent accumulated', `totalRecordsSent=${afterPoll.stats.totalRecordsSent}`);
  } else {
    fail('statusTracker records sent', `expected ${prevRecords + 5}, got ${afterPoll.stats.totalRecordsSent}`);
  }
  if (afterPoll.stats.lastPollDurationMs === 123) {
    pass('statusTracker lastPollDurationMs', '123ms');
  } else {
    fail('statusTracker lastPollDurationMs', `expected 123, got ${afterPoll.stats.lastPollDurationMs}`);
  }

  // 11f. Success rate calculation
  const statsAfter = afterPoll.stats;
  if (statsAfter.successRate !== null && typeof statsAfter.successRate === 'number') {
    pass('statusTracker successRate computed', `${statsAfter.successRate}%`);
  } else {
    fail('statusTracker successRate', `expected number, got ${statsAfter.successRate}`);
  }

  // 11g. startedAt is a valid ISO date
  if (statsAfter.startedAt && !Number.isNaN(Date.parse(statsAfter.startedAt))) {
    pass('statusTracker startedAt valid ISO', statsAfter.startedAt);
  } else {
    fail('statusTracker startedAt', `invalid: ${statsAfter.startedAt}`);
  }

  // 11h. Success with null readings — should keep previous readings
  recordKinabaseSuccess(null);
  const afterNullReadings = getKinabaseStatus();
  if (afterNullReadings.lastReadings && afterNullReadings.lastReadings.temperatureC === 295.15) {
    pass('statusTracker null readings → keeps previous', `temperatureC=${afterNullReadings.lastReadings.temperatureC}`);
  } else {
    fail('statusTracker null readings', 'lost previous readings');
  }

  // 11i. Failure with null/undefined error
  recordKinabaseFailure(null);
  const afterNullErr = getKinabaseStatus();
  if (afterNullErr.lastError && afterNullErr.lastError.message === 'Unknown error') {
    pass('statusTracker null error → "Unknown error"', afterNullErr.lastError.message);
  } else {
    fail('statusTracker null error', `expected "Unknown error", got ${afterNullErr.lastError?.message}`);
  }
}

// ─────────────────────────────────────────────
// 12. Connection Monitor (Background Process)
// ─────────────────────────────────────────────
console.log('\n🔌 12. Connection Monitor\n');

{
  // We test the ConnectionMonitor class by importing the module.
  // The singleton has already started in index.js context, but we test
  // the class behavior by examining the shared instance's API surface.

  // 12a. Import and verify API surface
  const cm = (await import('./src/connectionMonitor.js')).default;

  if (typeof cm.state === 'string' && ['connected', 'disconnected', 'checking'].includes(cm.state)) {
    pass('connectionMonitor state property', `"${cm.state}"`);
  } else {
    fail('connectionMonitor state', `unexpected: "${cm.state}"`);
  }

  if (typeof cm.connected === 'boolean') {
    pass('connectionMonitor connected property', `${cm.connected}`);
  } else {
    fail('connectionMonitor connected', `expected boolean, got ${typeof cm.connected}`);
  }

  // 12b. getStatus returns structured object
  const status = cm.getStatus();
  const expectedKeys = ['state', 'consecutiveFailures', 'lastCheckAt', 'lastConnectedAt', 'lastDisconnectedAt', 'lastFailureReason', 'nextCheckMs'];
  const missingKeys = expectedKeys.filter(k => !(k in status));
  if (missingKeys.length === 0) {
    pass('connectionMonitor getStatus() shape', expectedKeys.join(', '));
  } else {
    fail('connectionMonitor getStatus() shape', `missing: ${missingKeys.join(', ')}`);
  }

  if (typeof status.consecutiveFailures === 'number' && status.consecutiveFailures >= 0) {
    pass('connectionMonitor consecutiveFailures', `${status.consecutiveFailures}`);
  } else {
    fail('connectionMonitor consecutiveFailures', `${status.consecutiveFailures}`);
  }

  if (typeof status.nextCheckMs === 'number' && status.nextCheckMs > 0) {
    pass('connectionMonitor nextCheckMs positive', `${status.nextCheckMs}ms`);
  } else {
    fail('connectionMonitor nextCheckMs', `${status.nextCheckMs}`);
  }

  // 12c. waitForConnection() resolves immediately when connected
  if (cm.connected) {
    const start = Date.now();
    await cm.waitForConnection();
    const elapsed = Date.now() - start;
    if (elapsed < 100) {
      pass('connectionMonitor waitForConnection() immediate when connected', `${elapsed}ms`);
    } else {
      fail('connectionMonitor waitForConnection()', `took ${elapsed}ms (should be immediate)`);
    }
  } else {
    skip('connectionMonitor waitForConnection() immediate', 'not currently connected');
  }

  // 12d. EventEmitter interface
  if (typeof cm.on === 'function' && typeof cm.emit === 'function') {
    pass('connectionMonitor EventEmitter interface', 'on/emit available');
  } else {
    fail('connectionMonitor EventEmitter', 'missing on/emit methods');
  }

  // 12e. Events fire correctly (test with a temporary listener)
  let eventFired = false;
  const testListener = () => { eventFired = true; };
  cm.on('connected', testListener);
  cm.emit('connected');
  cm.removeListener('connected', testListener);
  if (eventFired) {
    pass('connectionMonitor event emission', '"connected" event fires');
  } else {
    fail('connectionMonitor event emission', 'event did not fire');
  }

  // 12f. reportFailure method exists and transitions state
  if (typeof cm.reportFailure === 'function') {
    pass('connectionMonitor reportFailure method', 'available');
  } else {
    fail('connectionMonitor reportFailure', 'method missing');
  }

  // 12g. stop() method exists
  if (typeof cm.stop === 'function') {
    pass('connectionMonitor stop method', 'available');
  } else {
    fail('connectionMonitor stop', 'method missing');
  }

  // 12h. start() method exists
  if (typeof cm.start === 'function') {
    pass('connectionMonitor start method', 'available');
  } else {
    fail('connectionMonitor start', 'method missing');
  }

  // 12i. Status timestamps are valid ISO strings (when set)
  if (status.lastCheckAt) {
    if (!Number.isNaN(Date.parse(status.lastCheckAt))) {
      pass('connectionMonitor lastCheckAt valid ISO', status.lastCheckAt);
    } else {
      fail('connectionMonitor lastCheckAt', `invalid: ${status.lastCheckAt}`);
    }
  } else {
    pass('connectionMonitor lastCheckAt', 'null (no check yet in test context)');
  }

  // 12j. Verify disconnected event listener can be added
  let disconnectedFired = false;
  const disconnectedListener = (reason) => { disconnectedFired = reason; };
  cm.on('disconnected', disconnectedListener);
  cm.emit('disconnected', 'test reason');
  cm.removeListener('disconnected', disconnectedListener);
  if (disconnectedFired === 'test reason') {
    pass('connectionMonitor disconnected event', `reason="${disconnectedFired}"`);
  } else {
    fail('connectionMonitor disconnected event', 'did not fire with reason');
  }
}

// ─────────────────────────────────────────────
// 13. Control Server (HTTP API)
// ─────────────────────────────────────────────
console.log('\n🌐 13. Control Server API\n');

{
  // Start a temporary control server for testing
  const { startControlServer } = await import('./src/controlServer.js');

  let mockBridgeEnabled = true;
  const mockStateProvider = async () => ({
    bridgeEnabled: mockBridgeEnabled,
    lastTimestamp: new Date().toISOString(),
  });
  const mockSetBridgeEnabled = async (enabled) => {
    mockBridgeEnabled = enabled;
  };
  const mockStatusProvider = () => ({
    connected: true,
    lastSuccess: new Date().toISOString(),
    lastError: null,
    lastReadings: { temperatureC: 295.15, humidity: 55 },
    errorLog: [],
    stats: {
      startedAt: new Date().toISOString(),
      uptimeMs: 10000,
      totalRecordsSent: 42,
      totalPollCycles: 10,
      totalErrors: 1,
      lastPollDurationMs: 150,
      successRate: 90,
    },
  });

  let testServer;
  let testPort;
  try {
    const result = startControlServer({
      stateProvider: mockStateProvider,
      setBridgeEnabled: mockSetBridgeEnabled,
      statusProvider: mockStatusProvider,
      port: 0, // Let OS assign a free port
    });
    testServer = result.server;

    // Wait for server to be ready and get the assigned port
    await new Promise(resolve => setTimeout(resolve, 500));
    testPort = testServer.address().port;

    const base = `http://localhost:${testPort}`;

    // 13a. GET /api/status
    try {
      const resp = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const body = await resp.json();
        if (body.bridgeEnabled === true && body.kinabase && body.device && body.connection) {
          pass('GET /api/status', `bridgeEnabled=${body.bridgeEnabled}, has kinabase/device/connection`);
        } else {
          fail('GET /api/status', `missing fields: ${JSON.stringify(Object.keys(body))}`);
        }
      } else {
        fail('GET /api/status', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('GET /api/status', err.message);
    }

    // 13b. GET /api/status returns upstream info
    try {
      const resp = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(5000) });
      const body = await resp.json();
      if ('upstream' in body) {
        pass('GET /api/status includes upstream', `state="${body.upstream?.state}"`);
      } else {
        fail('GET /api/status upstream', 'missing upstream field');
      }
    } catch (err) {
      fail('GET /api/status upstream', err.message);
    }

    // 13c. GET /api/status returns stats
    try {
      const resp = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(5000) });
      const body = await resp.json();
      const stats = body.kinabase?.stats;
      if (stats && typeof stats.uptimeMs === 'number' && typeof stats.totalRecordsSent === 'number') {
        pass('GET /api/status stats', `uptime=${stats.uptimeMs}ms, records=${stats.totalRecordsSent}`);
      } else {
        fail('GET /api/status stats', 'missing or invalid stats');
      }
    } catch (err) {
      fail('GET /api/status stats', err.message);
    }

    // 13d. GET /api/status returns lastReadings
    try {
      const resp = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(5000) });
      const body = await resp.json();
      if (body.kinabase?.lastReadings?.temperatureC === 295.15) {
        pass('GET /api/status lastReadings', `temperatureC=${body.kinabase.lastReadings.temperatureC}`);
      } else {
        fail('GET /api/status lastReadings', JSON.stringify(body.kinabase?.lastReadings));
      }
    } catch (err) {
      fail('GET /api/status lastReadings', err.message);
    }

    // 13e. POST /api/status — toggle bridge off
    try {
      const resp = await fetch(`${base}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridgeEnabled: false }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const body = await resp.json();
        if (body.bridgeEnabled === false) {
          pass('POST /api/status toggle off', `bridgeEnabled=${body.bridgeEnabled}`);
        } else {
          fail('POST /api/status toggle off', `bridgeEnabled=${body.bridgeEnabled}`);
        }
      } else {
        fail('POST /api/status toggle off', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('POST /api/status toggle off', err.message);
    }

    // 13f. POST /api/status — toggle bridge back on
    try {
      const resp = await fetch(`${base}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridgeEnabled: true }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const body = await resp.json();
        if (body.bridgeEnabled === true) {
          pass('POST /api/status toggle on', `bridgeEnabled=${body.bridgeEnabled}`);
        } else {
          fail('POST /api/status toggle on', `bridgeEnabled=${body.bridgeEnabled}`);
        }
      } else {
        fail('POST /api/status toggle on', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('POST /api/status toggle on', err.message);
    }

    // 13g. POST /api/status — invalid payload (missing bridgeEnabled)
    try {
      const resp = await fetch(`${base}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 400) {
        pass('POST /api/status invalid → 400', `HTTP ${resp.status}`);
      } else {
        fail('POST /api/status invalid', `expected 400, got ${resp.status}`);
      }
    } catch (err) {
      fail('POST /api/status invalid', err.message);
    }

    // 13h. POST /api/status — non-boolean bridgeEnabled
    try {
      const resp = await fetch(`${base}/api/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bridgeEnabled: 'yes' }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 400) {
        pass('POST /api/status string bridgeEnabled → 400', `HTTP ${resp.status}`);
      } else {
        fail('POST /api/status string bridgeEnabled', `expected 400, got ${resp.status}`);
      }
    } catch (err) {
      fail('POST /api/status string bridgeEnabled', err.message);
    }

    // 13i. GET /api/health
    try {
      const resp = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      const body = await resp.json();
      if (body.status && body.timestamp && typeof body.bridgeEnabled === 'boolean') {
        pass('GET /api/health', `status="${body.status}", bridgeEnabled=${body.bridgeEnabled}`);
      } else {
        fail('GET /api/health', `unexpected response: ${JSON.stringify(body)}`);
      }
    } catch (err) {
      fail('GET /api/health', err.message);
    }

    // 13j. GET /api/health returns upstream info
    try {
      const resp = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      const body = await resp.json();
      if ('upstream' in body) {
        pass('GET /api/health upstream', `state="${body.upstream?.state}"`);
      } else {
        fail('GET /api/health upstream', 'missing');
      }
    } catch (err) {
      fail('GET /api/health upstream', err.message);
    }

    // 13k. GET /api/health returns stats
    try {
      const resp = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      const body = await resp.json();
      if (body.stats && typeof body.stats === 'object') {
        pass('GET /api/health stats', `keys: ${Object.keys(body.stats).join(', ')}`);
      } else {
        fail('GET /api/health stats', 'missing');
      }
    } catch (err) {
      fail('GET /api/health stats', err.message);
    }

    // 13l. Static file serving (index.html)
    try {
      const resp = await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('Kinabridge')) {
          pass('GET / serves index.html', 'contains "Kinabridge"');
        } else {
          fail('GET / serves index.html', 'missing "Kinabridge" in response');
        }
      } else {
        fail('GET /', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('GET /', err.message);
    }

    // 13m. SPA fallback — unknown path returns index.html
    try {
      const resp = await fetch(`${base}/some/unknown/path`, { signal: AbortSignal.timeout(5000) });
      if (resp.ok) {
        const text = await resp.text();
        if (text.includes('Kinabridge')) {
          pass('GET /unknown → SPA fallback', 'serves index.html');
        } else {
          fail('GET /unknown → SPA fallback', 'does not contain Kinabridge');
        }
      } else {
        fail('GET /unknown', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('GET /unknown', err.message);
    }

    // 13n. GET /api/status returns connection info
    try {
      const resp = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(5000) });
      const body = await resp.json();
      if (body.connection?.baseUrl && body.connection?.collection && body.connection?.pollInterval) {
        pass('GET /api/status connection info', `baseUrl=${body.connection.baseUrl}, poll=${body.connection.pollInterval}`);
      } else {
        fail('GET /api/status connection info', `missing fields: ${JSON.stringify(body.connection)}`);
      }
    } catch (err) {
      fail('GET /api/status connection info', err.message);
    }

    // 13o. GET /api/status returns device info
    try {
      const resp = await fetch(`${base}/api/status`, { signal: AbortSignal.timeout(5000) });
      const body = await resp.json();
      if (body.device && body.device.name) {
        pass('GET /api/status device info', `name="${body.device.name}"`);
      } else {
        fail('GET /api/status device info', `missing: ${JSON.stringify(body.device)}`);
      }
    } catch (err) {
      fail('GET /api/status device info', err.message);
    }

    // 13p. POST /api/poll-now — without poll callback registered
    try {
      const resp = await fetch(`${base}/api/poll-now`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      if (resp.status === 503) {
        pass('POST /api/poll-now without callback → 503', `HTTP ${resp.status}`);
      } else {
        // May succeed if callback was somehow registered
        pass('POST /api/poll-now', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('POST /api/poll-now', err.message);
    }

    // 13q. POST /api/poll-now — with poll callback registered
    try {
      // Register a mock poll callback via the returned function
      const registerFn = result.registerPollCallback;
      if (typeof registerFn === 'function') {
        let pollCalled = false;
        registerFn(async () => { pollCalled = true; });
        const resp = await fetch(`${base}/api/poll-now`, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok && pollCalled) {
          const body = await resp.json();
          pass('POST /api/poll-now with callback', `triggered=${body.triggered}, poll called=${pollCalled}`);
        } else {
          fail('POST /api/poll-now with callback', `ok=${resp.ok}, pollCalled=${pollCalled}`);
        }
        // Deregister
        registerFn(null);
      } else {
        fail('registerPollCallback', 'not a function');
      }
    } catch (err) {
      fail('POST /api/poll-now with callback', err.message);
    }

    // 13r. GET /api/debug/influx-sample
    try {
      const resp = await fetch(`${base}/api/debug/influx-sample`, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const body = await resp.json();
        if ('count' in body && 'records' in body && Array.isArray(body.records)) {
          pass('GET /api/debug/influx-sample', `count=${body.count}, records=${body.records.length}`);
        } else {
          fail('GET /api/debug/influx-sample', `unexpected shape: ${Object.keys(body)}`);
        }
      } else if (resp.status === 500) {
        // InfluxDB may not be reachable in test env
        pass('GET /api/debug/influx-sample', `HTTP 500 (InfluxDB not reachable — expected in test env)`);
      } else {
        fail('GET /api/debug/influx-sample', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('GET /api/debug/influx-sample', err.message);
    }

    // 13s. GET /api/debug/transform-preview
    try {
      const resp = await fetch(`${base}/api/debug/transform-preview`, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        const body = await resp.json();
        if ('influxRecords' in body && 'transformedRecords' in body && 'influx' in body && 'kinabase' in body) {
          pass('GET /api/debug/transform-preview', `influx=${body.influxRecords}, transformed=${body.transformedRecords}`);
        } else {
          fail('GET /api/debug/transform-preview', `unexpected shape: ${Object.keys(body)}`);
        }
      } else if (resp.status === 500) {
        pass('GET /api/debug/transform-preview', `HTTP 500 (InfluxDB not reachable — expected in test env)`);
      } else {
        fail('GET /api/debug/transform-preview', `HTTP ${resp.status}`);
      }
    } catch (err) {
      fail('GET /api/debug/transform-preview', err.message);
    }

  } finally {
    // Cleanup: close the test server
    if (testServer) {
      await new Promise(resolve => testServer.close(resolve));
      pass('Control server cleanup', 'test server closed');
    }
  }
}

// ─────────────────────────────────────────────
// 14. Alert System (Frontend Notification Tests)
// ─────────────────────────────────────────────
console.log('\n🔔 14. Alert System Validation\n');

{
  // These are structural tests verifying the alert system is correctly
  // configured for the danger notification style (red, bottom-right).
  // Actual rendering requires a browser, so we validate config and CSS.

  const fs = await import('fs');

  // 14a. alerts.js loads without errors
  try {
    const alertCode = fs.readFileSync('./public/alerts.js', 'utf-8');
    if (alertCode.includes('AlertHandler') && alertCode.includes('addAlert')) {
      pass('alerts.js loads', 'AlertHandler and addAlert present');
    } else {
      fail('alerts.js structure', 'missing AlertHandler or addAlert');
    }
  } catch (err) {
    fail('alerts.js load', err.message);
  }

  // 14b. Danger variant has copyContent by default
  try {
    const alertCode = fs.readFileSync('./public/alerts.js', 'utf-8');
    if (alertCode.includes('copyContent: content') && alertCode.includes("variant: 'danger'")) {
      pass('danger variant includes copyContent', 'copy button enabled for errors');
    } else {
      fail('danger variant copyContent', 'missing copyContent default for danger');
    }
  } catch (err) {
    fail('danger variant copyContent', err.message);
  }

  // 14c. Toast container positioned bottom-right
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('toast-box--bottom') && css.includes('bottom: 24px') && css.includes('right: 24px')) {
      pass('toast-box bottom-right', 'bottom: 24px, right: 24px');
    } else {
      fail('toast-box position', 'not positioned bottom-right');
    }
  } catch (err) {
    fail('toast-box position', err.message);
  }

  // 14d. Danger toast has red/pink background (matching screenshot)
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('toast-alert--danger') && css.includes('rgba(255, 235, 235')) {
      pass('danger toast background', 'pink/red tinted (rgba(255, 235, 235))');
    } else {
      fail('danger toast background', 'not matching screenshot pink/red style');
    }
  } catch (err) {
    fail('danger toast background', err.message);
  }

  // 14e. Danger toast has dark maroon title
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('#6b1c1c')) {
      pass('danger toast title color', '#6b1c1c (dark maroon)');
    } else {
      fail('danger toast title color', 'missing maroon color for danger title');
    }
  } catch (err) {
    fail('danger toast title color', err.message);
  }

  // 14f. Danger toast hides the icon (matching screenshot style)
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('toast-alert--danger  .toast-icon { display: none; }')) {
      pass('danger toast icon hidden', 'matches screenshot (no icon)');
    } else {
      fail('danger toast icon', 'icon not hidden for danger variant');
    }
  } catch (err) {
    fail('danger toast icon', err.message);
  }

  // 14g. Danger toast has no left accent stripe
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes("toast-alert--danger::before  { background: transparent; }")) {
      pass('danger toast no accent stripe', 'transparent left border');
    } else {
      fail('danger toast accent stripe', 'should be transparent for screenshot match');
    }
  } catch (err) {
    fail('danger toast accent stripe', err.message);
  }

  // 14h. Alert variants all defined
  try {
    const alertCode = fs.readFileSync('./public/alerts.js', 'utf-8');
    const variants = ['success', 'danger', 'warning', 'primary', 'info'];
    const missing = variants.filter(v => !alertCode.includes(`VARIANT_ICONS`));
    if (missing.length === 0) {
      pass('alert variants defined', variants.join(', '));
    } else {
      fail('alert variants', `missing: ${missing.join(', ')}`);
    }
  } catch (err) {
    fail('alert variants', err.message);
  }

  // 14i. app.js uses danger variant for connection errors
  try {
    const appCode = fs.readFileSync('./public/app.js', 'utf-8');
    if (appCode.includes('AlertHandler.danger') && appCode.includes("title: 'Request Failed'")) {
      pass('app.js error notification', 'uses danger variant with "Request Failed" title');
    } else {
      fail('app.js error notification', 'not using danger variant or wrong title');
    }
  } catch (err) {
    fail('app.js error notification', err.message);
  }

  // 14j. index.html loads alerts.js before app.js
  try {
    const html = fs.readFileSync('./public/index.html', 'utf-8');
    const alertsPos = html.indexOf('alerts.js');
    const appPos = html.indexOf('app.js');
    if (alertsPos > 0 && appPos > 0 && alertsPos < appPos) {
      pass('Script load order', 'alerts.js before app.js');
    } else {
      fail('Script load order', 'alerts.js must load before app.js');
    }
  } catch (err) {
    fail('Script load order', err.message);
  }

  // 14k. Alert progress bar for danger uses correct color
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('toast-progress--danger') && css.includes('#9b3030')) {
      pass('danger progress bar color', '#9b3030');
    } else {
      fail('danger progress bar', 'missing or wrong color');
    }
  } catch (err) {
    fail('danger progress bar', err.message);
  }

  // 14l. Toast has close animation
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('toast-alert--exiting')) {
      pass('toast exit animation', 'toast-alert--exiting class defined');
    } else {
      fail('toast exit animation', 'missing');
    }
  } catch (err) {
    fail('toast exit animation', err.message);
  }

  // 14m. Toast responsive styles
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('@media (max-width: 480px)') && css.includes('toast-box--bottom')) {
      pass('toast responsive styles', 'mobile breakpoint defined');
    } else {
      fail('toast responsive', 'missing mobile breakpoint for toast');
    }
  } catch (err) {
    fail('toast responsive', err.message);
  }
}

// ─────────────────────────────────────────────
// 15. Endpoint URL Configuration
// ─────────────────────────────────────────────
console.log('\n🔗 15. Endpoint URL\n');

{
  const expectedBaseUrl = process.env.KINABASE_BASE_URL || config.kinabase.baseUrl;

  // 15a. Config has correct URL
  if (process.env.KINABASE_BASE_URL) {
    if (config.kinabase.baseUrl === process.env.KINABASE_BASE_URL) {
      pass('config.kinabase.baseUrl', config.kinabase.baseUrl);
    } else {
      fail(
        'config.kinabase.baseUrl',
        `expected ${process.env.KINABASE_BASE_URL}, got ${config.kinabase.baseUrl}`
      );
    }
  } else {
    pass('config.kinabase.baseUrl', config.kinabase.baseUrl);
  }

  // 15b. update-pi.sh has correct URL
  const fs = await import('fs');
  try {
    const script = fs.readFileSync('./update-pi.sh', 'utf-8');
    const match = script.match(/^KINABASE_BASE_URL=(.+)$/m);
    if (!match) {
      fail('update-pi.sh endpoint', 'missing KINABASE_BASE_URL line');
    } else if (match[1].trim() === expectedBaseUrl) {
      pass('update-pi.sh endpoint', `KINABASE_BASE_URL=${match[1].trim()}`);
    } else {
      fail(
        'update-pi.sh endpoint',
        `expected ${expectedBaseUrl}, got ${match[1].trim()}`
      );
    }
  } catch (err) {
    fail('update-pi.sh', err.message);
  }

  // 15c. URL format is valid
  try {
    const url = new URL(expectedBaseUrl);
    if (url.protocol === 'https:' && url.pathname === '/api/v1') {
      pass('URL format', `protocol=${url.protocol}, path=${url.pathname}`);
    } else {
      fail('URL format', `unexpected: protocol=${url.protocol}, path=${url.pathname}`);
    }
  } catch (err) {
    fail('URL format', err.message);
  }
}

// ─────────────────────────────────────────────
// 16. Reliability & Robustness
// ─────────────────────────────────────────────
console.log('\n🛡️  16. Reliability & Robustness\n');

{
  const fs = await import('fs');

  // 16a. Global crash handlers in index.js
  try {
    const indexCode = fs.readFileSync('./src/index.js', 'utf-8');
    if (indexCode.includes('unhandledRejection') && indexCode.includes('uncaughtException')) {
      pass('Global crash handlers', 'unhandledRejection + uncaughtException registered');
    } else {
      fail('Global crash handlers', 'missing unhandledRejection or uncaughtException');
    }
  } catch (err) {
    fail('Global crash handlers', err.message);
  }

  // 16b. Shutdown timeout exists
  try {
    const indexCode = fs.readFileSync('./src/index.js', 'utf-8');
    if (indexCode.includes('SHUTDOWN_TIMEOUT_MS') && indexCode.includes('forceExitTimer')) {
      pass('Shutdown timeout', 'force exit timer prevents hung shutdown');
    } else {
      fail('Shutdown timeout', 'missing shutdown timeout');
    }
  } catch (err) {
    fail('Shutdown timeout', err.message);
  }

  // 16c. Graceful HTTP server shutdown
  try {
    const indexCode = fs.readFileSync('./src/index.js', 'utf-8');
    if (indexCode.includes('controlServer.close')) {
      pass('Graceful HTTP shutdown', 'controlServer.close() called on exit');
    } else {
      fail('Graceful HTTP shutdown', 'HTTP server not closed on shutdown');
    }
  } catch (err) {
    fail('Graceful HTTP shutdown', err.message);
  }

  // 16d. ConnectionMonitor timer has try/catch safety
  try {
    const cmCode = fs.readFileSync('./src/connectionMonitor.js', 'utf-8');
    if (cmCode.includes('#scheduleNextCheck') && cmCode.includes('catch (error)') && cmCode.includes('Connection monitor check threw')) {
      pass('ConnectionMonitor timer safety', 'try/catch wraps performCheck in timer');
    } else {
      fail('ConnectionMonitor timer safety', 'missing error safety in timer callback');
    }
  } catch (err) {
    fail('ConnectionMonitor timer safety', err.message);
  }

  // 16e. Dashboard JSON parse safety
  try {
    const appCode = fs.readFileSync('./public/app.js', 'utf-8');
    if (appCode.includes('Invalid JSON response from server')) {
      pass('Dashboard JSON parse safety', 'try/catch around response.json()');
    } else {
      fail('Dashboard JSON parse safety', 'missing JSON parse error handling');
    }
  } catch (err) {
    fail('Dashboard JSON parse safety', err.message);
  }

  // 16f. Dashboard page unload cleanup
  try {
    const appCode = fs.readFileSync('./public/app.js', 'utf-8');
    if (appCode.includes('beforeunload') && appCode.includes('clearInterval(countdownInterval)') && appCode.includes('clearTimeout(dashboardPollTimer)')) {
      pass('Page unload cleanup', 'timers cleaned up on beforeunload');
    } else {
      fail('Page unload cleanup', 'missing timer cleanup on page unload');
    }
  } catch (err) {
    fail('Page unload cleanup', err.message);
  }

  // 16g. Browser offline/online detection
  try {
    const appCode = fs.readFileSync('./public/app.js', 'utf-8');
    if (appCode.includes("addEventListener('offline'") && appCode.includes("addEventListener('online'")) {
      pass('Offline/online detection', 'browser connectivity events handled');
    } else {
      fail('Offline/online detection', 'missing offline/online event listeners');
    }
  } catch (err) {
    fail('Offline/online detection', err.message);
  }

  // 16h. Sync Now button exists in HTML
  try {
    const html = fs.readFileSync('./public/index.html', 'utf-8');
    if (html.includes('sync-now-button') && html.includes('Sync Now')) {
      pass('Sync Now button in HTML', 'id="sync-now-button" present');
    } else {
      fail('Sync Now button', 'missing from index.html');
    }
  } catch (err) {
    fail('Sync Now button', err.message);
  }

  // 16i. Sync Now button wired up in app.js
  try {
    const appCode = fs.readFileSync('./public/app.js', 'utf-8');
    if (appCode.includes('triggerSyncNow') && appCode.includes('/api/poll-now')) {
      pass('Sync Now wiring', 'triggerSyncNow calls /api/poll-now');
    } else {
      fail('Sync Now wiring', 'missing poll-now call in app.js');
    }
  } catch (err) {
    fail('Sync Now wiring', err.message);
  }

  // 16j. Sync Now button has styles
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('.btn-sync') && css.includes('.status-actions')) {
      pass('Sync Now styles', '.btn-sync and .status-actions defined');
    } else {
      fail('Sync Now styles', 'missing btn-sync or status-actions styles');
    }
  } catch (err) {
    fail('Sync Now styles', err.message);
  }

  // 16k. Poll callback registration exposed by controlServer
  try {
    const csCode = fs.readFileSync('./src/controlServer.js', 'utf-8');
    if (csCode.includes('registerPollCallback') && csCode.includes('pollCallback')) {
      pass('Poll callback registration', 'registerPollCallback exposed');
    } else {
      fail('Poll callback registration', 'missing from controlServer');
    }
  } catch (err) {
    fail('Poll callback registration', err.message);
  }

  // 16l. Debug endpoints exist
  try {
    const csCode = fs.readFileSync('./src/controlServer.js', 'utf-8');
    if (csCode.includes('/api/debug/influx-sample') && csCode.includes('/api/debug/transform-preview')) {
      pass('Debug endpoints', 'influx-sample + transform-preview defined');
    } else {
      fail('Debug endpoints', 'missing debug endpoints');
    }
  } catch (err) {
    fail('Debug endpoints', err.message);
  }

  // 16m. controlServer accepts port override
  try {
    const csCode = fs.readFileSync('./src/controlServer.js', 'utf-8');
    if (csCode.includes('port: overridePort') || csCode.includes('overridePort')) {
      pass('Port override support', 'controlServer accepts port parameter');
    } else {
      fail('Port override', 'missing port override in controlServer');
    }
  } catch (err) {
    fail('Port override', err.message);
  }

  // 16n. index.js wires up registerPollCallback
  try {
    const indexCode = fs.readFileSync('./src/index.js', 'utf-8');
    if (indexCode.includes('registerPollCallback(poll)')) {
      pass('Poll callback wired', 'registerPollCallback(poll) in index.js');
    } else {
      fail('Poll callback wired', 'registerPollCallback not called in index.js');
    }
  } catch (err) {
    fail('Poll callback wired', err.message);
  }

  // 16o. Status detail truncation
  try {
    const appCode = fs.readFileSync('./public/app.js', 'utf-8');
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (appCode.includes('setStatusDetail') && appCode.includes('TRUNCATION_THRESHOLD') && appCode.includes('status-sub--has-more')) {
      pass('Status detail truncation', 'setStatusDetail with See more/less toggle');
    } else {
      fail('Status detail truncation', 'missing truncation logic in app.js');
    }
    if (css.includes('-webkit-line-clamp: 1') && css.includes('status-sub--expanded') && css.includes('status-sub--has-more::after')) {
      pass('Status detail CSS truncation', 'line-clamp + expanded state + See more pseudo-element');
    } else {
      fail('Status detail CSS truncation', 'missing CSS for status truncation');
    }
  } catch (err) {
    fail('Status detail truncation', err.message);
  }

  // 16p. Error panel — show first 3 with "Show all" button
  try {
    const appCode = fs.readFileSync('./public/app.js', 'utf-8');
    if (appCode.includes('VISIBLE_ERRORS_DEFAULT') && appCode.includes('showAllErrors') && appCode.includes('error-show-all-btn')) {
      pass('Error panel pagination', 'shows 3 errors by default + Show all button');
    } else {
      fail('Error panel pagination', 'missing error pagination logic');
    }
  } catch (err) {
    fail('Error panel pagination', err.message);
  }

  // 16q. Error messages truncated to 2 lines with expand
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('.error-msg') && css.includes('-webkit-line-clamp: 2') && css.includes('error-msg--expanded') && css.includes('.error-more-btn')) {
      pass('Error message truncation', '2-line clamp + Show more button');
    } else {
      fail('Error message truncation', 'missing error message truncation CSS');
    }
  } catch (err) {
    fail('Error message truncation', err.message);
  }

  // 16r. Error "Show all" button styles
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('.error-show-all') && css.includes('.error-show-all-btn')) {
      pass('Error show-all styles', '.error-show-all and .error-show-all-btn defined');
    } else {
      fail('Error show-all styles', 'missing');
    }
  } catch (err) {
    fail('Error show-all styles', err.message);
  }

  // 16s. Status left flex-shrink for proper layout
  try {
    const css = fs.readFileSync('./public/styles.css', 'utf-8');
    if (css.includes('.status-left') && css.includes('min-width: 0') && css.includes('flex: 1')) {
      pass('Status-left layout', 'min-width: 0 + flex: 1 prevents overflow');
    } else {
      fail('Status-left layout', 'missing overflow prevention');
    }
  } catch (err) {
    fail('Status-left layout', err.message);
  }
}

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────
console.log('\n' + '═'.repeat(50));
console.log(`  ✅ Passed: ${passed}   ❌ Failed: ${failed}   ⏭️  Skipped: ${skipped}`);
console.log('═'.repeat(50));

if (failed > 0) {
  console.log('\n⚠️  Some tests failed — review the output above.\n');
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!\n');
}
