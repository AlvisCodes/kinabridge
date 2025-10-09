# Kinabase Integration: Single Record Upsert Pattern

## Overview
The bridge now maintains **ONE record per machine** in Kinabase, updating it with the latest sensor readings on each poll cycle.

## How It Works

### External Service Tracking
The bridge uses Kinabase's "External Service" feature to track records by a unique identifier:

- **External Service Name**: `influxdb`
- **External ID**: The machine name (e.g., `sensor-123`)

### API Endpoints Used

1. **Update Existing Record** (primary operation):
   ```
   PATCH /api/v1/collections/sensor-readings/ext/influxdb/{machine-name}
   ```
   
2. **Create New Record** (first time only):
   ```
   POST /api/v1/collections/sensor-readings
   ```
   Then link to external service:
   ```
   PATCH /api/v1/collections/sensor-readings/{recordId}
   ```

### Flow Diagram

```
New sensor data arrives
    ↓
Try PATCH to /ext/influxdb/{machine-name}
    ↓
    ├─→ 200 OK: Record updated ✓
    ├─→ 404 Not Found: Create new record + link external ID
    ├─→ 401 Unauthorized: Check JWT token
    └─→ Other errors: Log and retry
```

## Record Structure

### Data Sent to Kinabase
```javascript
{
  data: {
    machine: "sensor-123",
    Timestamp: "2025-10-09T12:34:56.000Z",
    source: "shoestring-humidity-monitoring",
    Temperature: 22.5,
    Humidity: 65.2,
    Pressure: 1013.25
  }
}
```

### External Metadata (added on first create)
```javascript
{
  data: { ... },
  external: [
    {
      key: "influxdb",
      id: "sensor-123",
      properties: {
        source: "influxdb-humidity-monitoring"
      }
    }
  ]
}
```

## Key Benefits

1. **No Duplicate Records**: Each machine has exactly one record
2. **Always Current**: Record shows the latest sensor reading
3. **Efficient**: Only updates what changed
4. **Clean History**: Kinabase tracks update history automatically

## Polling Behavior

- **Interval**: Every 5 seconds (configurable via `POLL_INTERVAL_MS`)
- **Per Machine**: Each machine in InfluxDB gets its own upsert request
- **Failure Handling**: If one machine fails, others continue processing

## Troubleshooting

### Error: 401 Unauthorized
- **Cause**: JWT token expired or invalid
- **Solution**: Run `./update-jwt.sh` to update the token
- **Check**: Token expiry date (currently Dec 9, 2025)

### Error: 404 Not Found (on PATCH)
- **Normal**: First time seeing this machine
- **Action**: Bridge automatically creates the record
- **Result**: Next poll will successfully PATCH

### Error: 400 Bad Request
- **Cause**: Data format doesn't match collection schema
- **Check**: Field names must match (machine, Timestamp, Temperature, etc.)

## Monitoring

Check logs for these messages:

**Success**:
```
Successfully upserted record to Kinabase
```

**Created New**:
```
Created new record and linked to external service
```

**Auth Issue**:
```
Authentication failed - check JWT token validity and expiry
```

## Configuration

In `.env`:
```bash
KINABASE_BASE_URL=https://app.kinabase.com/api/v1
KINABASE_COLLECTION=sensor-readings
KINABASE_JWT=eyJhbGciOi...  # Update with ./update-jwt.sh
POLL_INTERVAL_MS=5000        # How often to check for new data
```

## Raspberry Pi Deployment

```bash
cd ~/kinabridge
git pull origin main
./update-jwt.sh
pm2 restart kinabase-bridge
pm2 logs kinabase-bridge --lines 50
```

## Verification

1. Check Kinabase UI at https://app.kinabase.com
2. Look for records in "sensor-readings" collection
3. Each machine should have ONE record
4. Timestamp should update with each poll
5. Temperature/Humidity/Pressure should reflect latest values

## API Reference

See the complete Kinabase API OpenAPI spec in the previous conversation for full endpoint documentation.
