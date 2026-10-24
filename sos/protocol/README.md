# ResQNet Offline Store-and-Forward Mesh Protocol & Delivery Lifecycle (Phase 2)

## 1. Executive Summary

This specification defines the communication contract, lifecycle states, and packet structures for the **ResQNet Distress Delivery Architecture**, connecting citizen handsets (`sos/mobile`), peer relay nodes, incident command gateways, and the responder dashboard (`responder-dashboard/`).

In disaster-hit regions of Kerala where cellular towers lose power or backhaul, ResQNet operates an opportunistic store-and-forward mesh with strict delivery invariants, bounded multi-hop forwarding, and authoritative rescuer acknowledgements.

---

## 2. The 8 Honest Delivery States

Under no circumstances does ResQNet mark a message as "Delivered" simply because it was placed in a queue, saved locally, or transmitted via Bluetooth. Delivery state transitions are strictly honest:

```
[1. SAVED_LOCALLY]
       │
       ▼
[2. QUEUED_FOR_TRANSMISSION]
       │
       ├─────────────────────────────────┐ (Direct Internet)
       │ (BLE Peer Mesh)                 ▼
       ▼                        [5. UPLOADED_TO_SERVER]
[3. TRANSMITTED_TO_PEER]                 │
       │                                 ▼
       ▼                        [6. ACKNOWLEDGED_BY_SERVER]
[4. RECEIVED_BY_PEER]                    │
       │                                 ▼
       └──────────────► [Relay Station] ─┤ (Rescuer Commander Accepts)
                                         ▼
                                [7. ACKNOWLEDGED_BY_RESCUER]
```

| State | Display Name | Technical Meaning | Handset UI Indicator |
| :--- | :--- | :--- | :--- |
| **`SAVED_LOCALLY`** | Saved Locally | Written to local SQLite Room database on citizen handset before any network attempt. | Slate Gray Badge |
| **`QUEUED_FOR_TRANSMISSION`** | Queued for Transmission | Enqueued for background network upload via WorkManager or BLE mesh broadcast. | Orange Badge |
| **`TRANSMITTED_TO_PEER`** | Transmitted to Peer | Sent as a 56-byte compact binary beacon to an adjacent handset. | Cyan Badge |
| **`RECEIVED_BY_PEER`** | Received by Peer | Ingested by a neighboring handset operating in Responder/Relay mode. | Blue Badge |
| **`UPLOADED_TO_SERVER`** | Uploaded to Server | HTTP packet reached the FastAPI gateway, awaiting confirmed write response. | Indigo Badge |
| **`ACKNOWLEDGED_BY_SERVER`** | Server Acknowledged | Written to persistent server database (`SosIncidentRecord`). In rescue queue. | Sky Blue Badge (`● SERVER RECEIVED`) |
| **`ACKNOWLEDGED_BY_RESCUER`** | Rescuer Acknowledged | Formally acknowledged and accepted by an incident commander or rescue team. | Emerald Green Badge (`✓ RESCUER ACK`) |
| **`FAILED_OR_EXPIRED`** | Expired / Undelivered | 24-hour TTL elapsed before reaching gateway, or max hop count exceeded. | Red Badge |

---

## 3. End-to-End Rescuer Acknowledgement & Stopping Rules

A critical flaw in naive disaster mesh protocols is **broadcast storms and infinite relay loops**: devices keep re-transmitting distress packets indefinitely, exhausting batteries of flooded victims.

ResQNet implements three strict stopping rules:

### Rule 1: Hop Count Limit (< 3 Hops)
Each distress packet includes a `hopCount` field. Origin handsets start with `hopCount = 0`. Each relay handset increments `hopCount += 1`.
- If `hopCount > 3`, the packet is dropped immediately by peer nodes and rejected by `/api/sos/relay` with HTTP 400 (`Hop limit exceeded`).

### Rule 2: Expiration Window (24-Hour TTL)
Each distress packet contains a creation timestamp and `expires_at` window (default 24 hours). If `current_time - created_at > 24 hours`, nodes drop the packet.

### Rule 3: Stop-Forwarding Propagation (`/api/sos/stop-forwarding`)
Once a distress message is written to the server database (`ACKNOWLEDGED_BY_SERVER`) or accepted by a commander (`ACKNOWLEDGED_BY_RESCUER`), the server adds its client-generated `message_id` to the stop-forwarding instruction set:
```json
GET /api/sos/stop-forwarding
Response:
{
  "confirmed_message_ids": ["550e8400-e29b-41d4-a716-446655440000", ...],
  "as_of": "2026-10-24T05:40:00Z"
}
```
When relay handsets or citizen handsets connect to the gateway:
1. They download the confirmed message IDs.
2. The handset matches local Room records by `message_id`.
3. If an incident has reached `ACKNOWLEDGED_BY_SERVER` or `ACKNOWLEDGED_BY_RESCUER`, the device ceases BLE transmission and stops queuing the packet for relay, preserving battery.

---

## 4. Compact 56-Byte BLE Advertisement Frame

For BLE extended advertising framing without packet fragmentation:

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Magic (0x5251) = 'RQ'         | Version (0x01)| Severity (0-3)|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Incident ID (16 Bytes UUID)              |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Message ID (16 Bytes UUID)               |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Timestamp UTC (4 Bytes, Epoch Seconds)   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Latitude (4 Bytes, Fixed-point 1e-5)     |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Longitude (4 Bytes, Fixed-point 1e-5)    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Accuracy (1 B)| People (1 B)  | Hop Count (1B)| Max Hops (1B) |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Flags (Vulnerable, Medical)   | Reserved / CRC-16 Checksum    |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

Total compact beacon size: **56 Bytes**.

---

## 5. Android Operating System Constraints & WorkManager Integration

Real-world Android devices operate under aggressive battery saving constraints:
1. **Doze Mode & App Standby**: Starting in Android 6.0 and intensified in Android 10+, background network requests and BLE scans are throttled or suspended when the device is idle or the app is closed.
2. **WorkManager Guarantee**: To survive process death, phone reboots, and network reconnection, ResQNet enqueues `SosUploadWorker` with `Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()`. As soon as connectivity returns, WorkManager executes the deferred upload, syncs acknowledgements, and halts further advertising.
3. **Role Architecture**: Handsets can toggle between:
   - **Citizen Mode**: Optimized for low power, emergency panic triggers, GPS lock, and welfare broadcasts.
   - **Responder / Relay Mode**: Activates peer beacon monitoring, forward queues, and gateway uplink synchronization.
