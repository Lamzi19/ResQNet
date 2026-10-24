"""
ResQNet Bluetooth Low Energy (BLE) Laptop Gateway Receiver.

Listens for over-the-air 25-byte distress beacon packets advertised by offline
Android handsets running the ResQNet SOS app.

Validates the binary frame, extracts coordinates, people count, and severity,
deduplicates repeated advertisement frames, and forwards the genuine distress
signal directly into the local FastAPI backend (http://localhost:8000/api/sos/ble-ingest).

Zero internet required. Fully functional offline.
"""

import sys
import os
import time
import struct
import argparse
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, Set
import urllib.request
import json

try:
    from bleak import BleakScanner
    from bleak.backends.device import BLEDevice
    from bleak.backends.scanner import AdvertisementData
except ImportError:
    print("[ERROR] 'bleak' library is not installed. Please install it with: pip install bleak")
    sys.exit(1)


# Official ResQNet 16-bit Service UUID FE50
# Lowercase 128-bit standard representation:
RESQNET_SERVICE_UUID = "0000fe50-0000-1000-8000-00805f9b34fb"
SHORT_UUID = "fe50"
MAGIC_BYTES = b"\x52\x51"  # 'R', 'Q'

SEVERITY_MAP = {
    0: "LOW",
    1: "MODERATE",
    2: "HIGH",
    3: "CRITICAL"
}


def compute_crc16(data: bytes, offset: int = 0, length: Optional[int] = None) -> int:
    """CRC-16 IBM / Modbus polynomial matching BleSosBroadcaster.kt."""
    if length is None:
        length = len(data) - offset
    crc = 0xFFFF
    for i in range(offset, offset + length):
        crc ^= data[i]
        for _ in range(8):
            if crc & 0x0001:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


def decode_distress_beacon(raw_bytes: bytes) -> Optional[Dict[str, Any]]:
    """
    Decode 25-byte ResQNet distress beacon frame.
    Format:
      - Bytes 0-1: Magic 'R', 'Q' (0x52, 0x51)
      - Byte 2: Protocol Version (0x01)
      - Byte 3: Severity code (0-3)
      - Byte 4: Stranded people count (1-255)
      - Byte 5: Flags (bit 0 = hasVulnerable)
      - Byte 6: Hop count (0-10)
      - Bytes 7-10: Latitude fixed-point (int32 big-endian / 100000.0) or 0x7FFFFFFF if null
      - Bytes 11-14: Longitude fixed-point (int32 big-endian / 100000.0) or 0x7FFFFFFF if null
      - Bytes 15-18: Timestamp (uint32 big-endian epoch seconds)
      - Bytes 19-22: Message UUID Hash (int32 big-endian)
      - Bytes 23-24: CRC-16 (uint16 big-endian)
    """
    if len(raw_bytes) < 25:
        return None

    # Check magic
    if raw_bytes[:2] != MAGIC_BYTES:
        return None

    # Check version
    version = raw_bytes[2]
    if version != 0x01:
        return None

    # Verify CRC16 over first 23 bytes
    expected_crc = struct.unpack(">H", raw_bytes[23:25])[0]
    calculated_crc = compute_crc16(raw_bytes, 0, 23)
    if expected_crc != calculated_crc:
        print(f"  [WARN] CRC16 mismatch: expected 0x{expected_crc:04X}, calculated 0x{calculated_crc:04X}. Ignoring corrupt frame.")
        return None

    sev_code = raw_bytes[3]
    severity = SEVERITY_MAP.get(sev_code, "LOW" if sev_code == 0 else "MODERATE" if sev_code == 1 else "HIGH" if sev_code == 2 else "CRITICAL")
    people_count = raw_bytes[4]
    flags = raw_bytes[5]
    has_vulnerable = bool(flags & 0x01)
    cat_code = (flags >> 1) & 0x07
    hop_count = raw_bytes[6]

    CATEGORY_MAP = {
        0: "general",
        1: "trapped",
        2: "injured",
        3: "stranded",
        4: "supplies",
        5: "safe"
    }
    category = CATEGORY_MAP.get(cat_code, "general")
    if category == "general":
        if sev_code == 0:
            category = "safe"
        elif sev_code == 1:
            category = "supplies"
        elif sev_code == 2:
            category = "stranded"
        elif sev_code == 3:
            category = "trapped"

    lat_raw = struct.unpack(">i", raw_bytes[7:11])[0]
    lon_raw = struct.unpack(">i", raw_bytes[11:15])[0]

    latitude = None if lat_raw == 0x7FFFFFFF else round(lat_raw / 100000.0, 5)
    longitude = None if lon_raw == 0x7FFFFFFF else round(lon_raw / 100000.0, 5)

    timestamp_sec = struct.unpack(">I", raw_bytes[15:19])[0]
    msg_hash = struct.unpack(">i", raw_bytes[19:23])[0]

    # Generate a stable, deterministic message ID from hash
    # E.g. MSG-BLE-4A2E7F10
    hash_hex = f"{msg_hash & 0xFFFFFFFF:08X}"
    message_id = f"MSG-BLE-{hash_hex}"
    incident_id = f"SOS-BLE-{hash_hex[:6]}"

    created_iso = datetime.utcfromtimestamp(timestamp_sec).isoformat() + "Z"

    return {
        "message_id": message_id,
        "incident_id": incident_id,
        "severity": severity,
        "category": category,
        "people_count": people_count,
        "has_vulnerable_people": has_vulnerable,
        "hop_count": hop_count,
        "latitude": latitude,
        "longitude": longitude,
        "timestamp_sec": timestamp_sec,
        "created_at": created_iso,
        "raw_hex": raw_bytes.hex().upper()
    }


def forward_to_backend(beacon_data: Dict[str, Any], backend_url: str, rssi: Optional[int], mac_address: str) -> bool:
    """Forward decoded distress beacon to the local FastAPI backend."""
    ingest_endpoint = f"{backend_url.rstrip('/')}/api/sos/ble-ingest"

    cat = beacon_data.get("category", "general")
    ppl = beacon_data["people_count"]
    sev = beacon_data["severity"]

    if cat == "safe":
        msg = f"Citizen BLE Welfare Beacon: {ppl} person(s) reported safe."
    elif cat == "supplies":
        msg = f"Citizen BLE Supplies Beacon: {ppl} person(s) requesting food/water supplies."
    elif cat == "injured":
        msg = f"Medical Distress Beacon: {ppl} person(s) requiring medical assistance."
    elif cat == "trapped":
        msg = f"Urgent Distress Beacon: {ppl} person(s) trapped."
    elif cat == "stranded":
        msg = f"Evacuation Distress Beacon: {ppl} person(s) stranded."
    else:
        msg = f"Emergency BLE Distress Beacon: {ppl} person(s) reported ({sev})."

    payload = {
        "messageId": beacon_data["message_id"],
        "incidentId": beacon_data["incident_id"],
        "latitude": beacon_data["latitude"],
        "longitude": beacon_data["longitude"],
        "severity": beacon_data["severity"],
        "peopleCount": beacon_data["people_count"],
        "hasVulnerablePeople": beacon_data["has_vulnerable_people"],
        "category": cat,
        "messageText": msg,
        "hopCount": beacon_data["hop_count"],
        "rssi": rssi,
        "rawBeaconHex": beacon_data["raw_hex"],
        "sourceMac": mac_address,
        "isDemo": False
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            ingest_endpoint,
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status in (200, 201):
                res_body = json.loads(resp.read().decode("utf-8"))
                inc_id = res_body.get("id", beacon_data["incident_id"])
                prio_score = res_body.get("priority_score", "N/A")
                prio_level = res_body.get("priority_level", "N/A")
                district = res_body.get("district_name", "N/A")
                print(f"  [SUCCESS] Forwarded to backend -> Incident: {inc_id} | Priority: {prio_score} pts ({prio_level}) | District: {district}")
                return True
            else:
                print(f"  [WARN] Backend responded with HTTP status {resp.status}")
                return False
    except Exception as e:
        print(f"  [ERROR] Failed to post to backend at {ingest_endpoint}: {e}")
        return False


class BleGatewayRunner:
    def __init__(self, backend_url: str = "http://localhost:8000"):
        self.backend_url = backend_url
        self.seen_messages: Dict[str, float] = {}  # message_id -> last_forwarded_time
        self.dedup_window_seconds = 30.0  # Don't re-post duplicate advertisements within 30s
        self.device_count = 0
        self.known_macs: Set[str] = set()

    def on_advertisement(self, device: BLEDevice, advertisement_data: AdvertisementData):
        mac = device.address or "UNKNOWN_MAC"
        if mac not in self.known_macs:
            self.known_macs.add(mac)
            self.device_count = len(self.known_macs)

        service_data = advertisement_data.service_data or {}
        mfg_data = advertisement_data.manufacturer_data or {}

        matching_payload: Optional[bytes] = None

        # 1. Look for ResQNet service UUIDs in service_data dictionary (FE50 or 5251)
        for uuid_key, payload_bytes in service_data.items():
            uuid_str = str(uuid_key).lower()
            if "fe50" in uuid_str or "5251" in uuid_str:
                matching_payload = payload_bytes
                break

        # 2. Check manufacturer data (e.g. 0x5251, 0xFE50, or any containing RQ)
        if matching_payload is None:
            for mfg_id, payload_bytes in mfg_data.items():
                if len(payload_bytes) >= 25 and payload_bytes[:2] == MAGIC_BYTES:
                    matching_payload = payload_bytes
                    break

        # 3. Fallback: check all service data values for magic bytes 'RQ'
        if matching_payload is None:
            for payload_bytes in service_data.values():
                if len(payload_bytes) >= 25 and payload_bytes[:2] == MAGIC_BYTES:
                    matching_payload = payload_bytes
                    break

        if matching_payload is None:
            return

        rssi = advertisement_data.rssi
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [BLE-DETECT] Captured potential distress frame from {mac} (RSSI: {rssi} dBm, {len(matching_payload)} bytes)")

        beacon_data = decode_distress_beacon(matching_payload)
        if not beacon_data:
            print(f"  [WARN] Failed to decode 25-byte distress frame from {mac}. Check CRC or version.")
            return

        msg_id = beacon_data["message_id"]
        now = time.time()
        last_seen = self.seen_messages.get(msg_id, 0.0)

        if (now - last_seen) < self.dedup_window_seconds:
            # Duplicate continuous advertisement frame: ignore repeated HTTP forward
            return

        self.seen_messages[msg_id] = now

        print("\n" + "=" * 65)
        hops = beacon_data['hop_count']
        if hops > 0:
            print(f"★ RESQNET MULTI-HOP MESH SOS BEACON RECEIVED OVER-THE-AIR (HOP {hops})")
            print(f"  Relay Node MAC: {mac} (RSSI: {rssi} dBm)")
        else:
            print(f"★ RESQNET DIRECT BLE DISTRESS BEACON RECEIVED OVER-THE-AIR (HOP 0)")
            print(f"  Origin Node MAC: {mac} (RSSI: {rssi} dBm)")
        print(f"  Timestamp    : {beacon_data['created_at']}")
        print(f"  Hop Count    : {hops}")
        print(f"  Message ID   : {msg_id}")
        print(f"  Incident ID  : {beacon_data['incident_id']}")
        print(f"  Severity     : {beacon_data['severity']}")
        print(f"  People Count : {beacon_data['people_count']} stranded (Vulnerable: {beacon_data['has_vulnerable_people']})")
        print(f"  GPS Location : Lat {beacon_data['latitude']}, Lon {beacon_data['longitude']}")
        print(f"  Payload Hex  : {beacon_data['raw_hex']} ({len(matching_payload)} bytes)")
        print("-" * 65)

        forward_to_backend(beacon_data, self.backend_url, rssi, mac)
        print("=" * 65 + "\n")


async def main():
    parser = argparse.ArgumentParser(description="ResQNet Laptop Bluetooth LE Distress Gateway")
    parser.add_argument("--backend", default="http://localhost:8000", help="FastAPI backend base URL (default: http://localhost:8000)")
    parser.add_argument("--test-beacon", action="store_true", help="Simulate receiving a 25-byte test beacon to verify parsing and backend persistence")
    args = parser.parse_args()

    print("=" * 70)
    print("  ResQNet Emergency Bluetooth LE Laptop Gateway Receiver")
    print(f"  Target Backend : {args.backend}")
    print(f"  BLE Service ID : {RESQNET_SERVICE_UUID} (Short: 0x{SHORT_UUID.upper()})")
    print(f"  Local Status   : OFFLINE MODE (No Internet Required)")
    print("=" * 70)

    if args.test_beacon:
        print("\n[TEST] Generating and ingesting synthetic 25-byte ResQNet BLE test beacon...")
        # Aluva test coordinates (10.1076, 76.3516)
        lat_fixed = int(10.1076 * 100000)
        lon_fixed = int(76.3516 * 100000)
        epoch = int(time.time())
        msg_hash = 0x12345678

        frame = bytearray(25)
        frame[0:2] = MAGIC_BYTES
        frame[2] = 0x01  # version
        frame[3] = 0x03  # CRITICAL
        frame[4] = 4     # 4 people
        frame[5] = 0x01  # has vulnerable
        frame[6] = 0     # 0 hops
        frame[7:11] = struct.pack(">i", lat_fixed)
        frame[11:15] = struct.pack(">i", lon_fixed)
        frame[15:19] = struct.pack(">I", epoch)
        frame[19:23] = struct.pack(">i", msg_hash)
        crc = compute_crc16(bytes(frame), 0, 23)
        frame[23:25] = struct.pack(">H", crc)

        decoded = decode_distress_beacon(bytes(frame))
        if decoded:
            print(f"[TEST] Successfully decoded frame: {decoded}")
            success = forward_to_backend(decoded, args.backend, -55, "TEST:BLE:MAC:00")
            if success:
                print("[TEST PASS] Simulated BLE beacon ingested into local database successfully!")
            else:
                print("[TEST FAIL] Could not forward beacon to backend. Ensure FastAPI is running on port 8000.")
        else:
            print("[TEST FAIL] Could not decode test frame.")
        return

    runner = BleGatewayRunner(backend_url=args.backend)
    print("\n[INFO] Starting Bluetooth Low Energy scanner...")
    print("[INFO] Listening for offline distress broadcasts from ResQNet Android handsets...")
    print("[INFO] Press Ctrl+C to terminate gateway.\n")

    scanner = BleakScanner(detection_callback=runner.on_advertisement)

    try:
        await scanner.start()
        heartbeat_ticks = 0
        while True:
            await asyncio.sleep(1.0)
            heartbeat_ticks += 1
            if heartbeat_ticks % 10 == 0:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] [BLE Gateway Heartbeat] Active scanner listening on Windows ({runner.device_count} BLE devices detected in radio range, {len(runner.seen_messages)} distress beacons captured)")
    except asyncio.CancelledError:
        pass
    finally:
        await scanner.stop()
        print("\n[INFO] BLE Gateway stopped.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] Exiting on user interrupt.")
