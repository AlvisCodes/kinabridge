import { InfluxDB } from '@influxdata/influxdb-client';
import { config as loadEnv } from 'dotenv';

loadEnv();

const influxUrl = process.env.INFLUX_URL;
const influxToken = process.env.INFLUX_READ_TOKEN;
const influxOrg = process.env.INFLUX_ORG;
const influxBucket = process.env.INFLUX_BUCKET;

console.log('🔍 Testing InfluxDB Connection...\n');
console.log('Configuration:');
console.log(`  URL: ${influxUrl}`);
console.log(`  Org: ${influxOrg}`);
console.log(`  Bucket: ${influxBucket}`);
console.log(`  Token: ${influxToken ? influxToken.substring(0, 20) + '...' : 'NOT SET'}\n`);

const influxDB = new InfluxDB({ url: influxUrl, token: influxToken });
const queryApi = influxDB.getQueryApi(influxOrg);

// Test 1: Check if we can connect and query buckets
async function testConnection() {
  try {
    console.log('📊 Test 1: Checking InfluxDB connectivity...');
    
    const query = `
      from(bucket: "${influxBucket}")
        |> range(start: -1h)
        |> filter(fn: (r) => r["_measurement"] == "humidity_sensors")
        |> limit(n: 1)
    `;
    
    let rowCount = 0;
    await queryApi.queryRows(query, {
      next(row, tableMeta) {
        rowCount++;
        const o = tableMeta.toObject(row);
        console.log('✅ Connection successful! Sample data point found:');
        console.log(JSON.stringify(o, null, 2));
      },
      error(error) {
        console.error('❌ Query error:', error);
        throw error;
      },
      complete() {
        if (rowCount === 0) {
          console.log('⚠️  No data found in the last hour for measurement "humidity_sensors"');
          console.log('   This might mean:');
          console.log('   - The sensor is not publishing data');
          console.log('   - The measurement name is different');
          console.log('   - Data is older than 1 hour\n');
        }
      },
    });
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    process.exit(1);
  }
}

// Test 2: Get recent data summary
async function getDataSummary() {
  try {
    console.log('\n📈 Test 2: Getting data summary from last 24 hours...');
    
    const query = `
      from(bucket: "${influxBucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r["_measurement"] == "humidity_sensors")
        |> group(columns: ["machine", "_field"])
        |> count()
    `;
    
    const results = [];
    await queryApi.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        results.push(o);
      },
      error(error) {
        console.error('❌ Summary query error:', error);
      },
      complete() {
        if (results.length === 0) {
          console.log('⚠️  No data found in the last 24 hours');
        } else {
          console.log('\n✅ Data summary (last 24 hours):');
          results.forEach(r => {
            console.log(`   Machine: ${r.machine || 'unknown'}, Field: ${r._field}, Count: ${r._value}`);
          });
        }
      },
    });
  } catch (error) {
    console.error('❌ Summary query failed:', error.message);
  }
}

// Test 3: Get most recent data points
async function getRecentData() {
  try {
    console.log('\n🔬 Test 3: Getting most recent data points...');
    
    const query = `
      from(bucket: "${influxBucket}")
        |> range(start: -7d)
        |> filter(fn: (r) => r["_measurement"] == "humidity_sensors")
        |> last()
    `;
    
    const results = [];
    await queryApi.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        results.push(o);
      },
      error(error) {
        console.error('❌ Recent data query error:', error);
      },
      complete() {
        if (results.length === 0) {
          console.log('⚠️  No data found in the last 7 days');
        } else {
          console.log('\n✅ Most recent data points:');
          results.forEach(r => {
            console.log(`   Time: ${r._time}`);
            console.log(`   Machine: ${r.machine || 'unknown'}`);
            console.log(`   Field: ${r._field}`);
            console.log(`   Value: ${r._value}`);
            console.log('   ---');
          });
        }
      },
    });
  } catch (error) {
    console.error('❌ Recent data query failed:', error.message);
  }
}

// Test 4: Check measurement structure
async function checkMeasurements() {
  try {
    console.log('\n🔍 Test 4: Checking available measurements...');
    
    const query = `
      import "influxdata/influxdb/schema"
      schema.measurements(bucket: "${influxBucket}")
    `;
    
    const measurements = [];
    await queryApi.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        measurements.push(o._value);
      },
      error(error) {
        console.error('❌ Measurements query error:', error);
      },
      complete() {
        if (measurements.length === 0) {
          console.log('⚠️  No measurements found in bucket');
        } else {
          console.log('\n✅ Available measurements:');
          measurements.forEach(m => {
            console.log(`   - ${m}`);
          });
        }
      },
    });
  } catch (error) {
    console.error('❌ Measurements check failed:', error.message);
  }
}

// Run all tests
async function runTests() {
  try {
    await testConnection();
    await getDataSummary();
    await getRecentData();
    await checkMeasurements();
    
    console.log('\n✅ All tests completed!\n');
    console.log('Next steps:');
    console.log('  - If data is found, run: npm start');
    console.log('  - If no data, check the Shoestring HumidityMonitoring stack');
    console.log('  - Monitor the bridge at: http://localhost:4300\n');
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

runTests();
