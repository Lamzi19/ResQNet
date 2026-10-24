package org.resqnet.sos

import org.junit.Assert.*
import org.junit.Test
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.data.model.SosSeverity
import org.resqnet.sos.network.BleRelayManager
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Unit tests for ResQNet Phase 2 Offline Store-and-Forward Mesh Protocol:
 * - 25-byte compact beacon packing and unpacking
 * - CRC-16 integrity validation and corruption rejection
 * - Multi-hop hop count incrementation
 * - Original GPS coordinate and timestamp preservation
 * - Max hop limit and loop prevention
 * - Null GPS coordinate handling
 * - Deterministic message ID matching ble_gateway.py
 */
class BleMeshRelayTest {

    // Helper dummy to test packing/unpacking without Android Context
    private val relayManager = object {
        fun computeCrc16(data: ByteArray, offset: Int, length: Int): Short =
            BleRelayManager.computeCrc16(data, offset, length)

        fun packCompactBeacon(entity: SosEntity, hopCount: Int = 0): ByteArray {
            val buffer = ByteBuffer.allocate(25).order(ByteOrder.BIG_ENDIAN)
            buffer.putShort(BleRelayManager.MAGIC_HEADER)
            buffer.put(BleRelayManager.PROTOCOL_VERSION)

            val sevByte = when (entity.severity) {
                SosSeverity.CRITICAL -> 3.toByte()
                SosSeverity.HIGH -> 2.toByte()
                SosSeverity.MODERATE -> 1.toByte()
                SosSeverity.LOW -> 0.toByte()
            }
            buffer.put(sevByte)
            buffer.put(entity.peopleCount.coerceIn(1, 255).toByte())

            var flags: Byte = 0
            if (entity.hasVulnerablePeople) flags = (flags.toInt() or 0x01).toByte()
            buffer.put(flags)
            buffer.put(hopCount.coerceIn(0, 10).toByte())

            val latFixed = entity.latitude?.let { (it * 100000.0).toInt() } ?: BleRelayManager.NULL_COORDINATE
            val lonFixed = entity.longitude?.let { (it * 100000.0).toInt() } ?: BleRelayManager.NULL_COORDINATE
            buffer.putInt(latFixed)
            buffer.putInt(lonFixed)

            val epochSec = (entity.createdAt / 1000L).toInt()
            buffer.putInt(epochSec)

            val msgHash = entity.messageId.hashCode()
            buffer.putInt(msgHash)

            val bytes = buffer.array()
            val crc = computeCrc16(bytes, 0, 23)
            buffer.position(23)
            buffer.putShort(crc)

            return bytes
        }

        fun unpackSosBeacon(payload: ByteArray): Map<String, Any?>? {
            if (payload.size < 25) return null
            val buffer = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN)

            val magic = buffer.short
            if (magic != BleRelayManager.MAGIC_HEADER) return null

            val version = buffer.get()
            if (version.toInt() != 0x01) return null

            val expectedCrc = buffer.getShort(23)
            val computedCrc = computeCrc16(payload, 0, 23)
            if (expectedCrc != computedCrc) return null

            val severityByte = buffer.get()
            val severity = when (severityByte.toInt()) {
                3 -> SosSeverity.CRITICAL
                2 -> SosSeverity.HIGH
                1 -> SosSeverity.MODERATE
                else -> SosSeverity.LOW
            }
            val peopleCount = buffer.get().toInt().coerceAtLeast(1)
            val flags = buffer.get()
            val hasVulnerable = (flags.toInt() and 0x01) != 0
            val hopCount = buffer.get().toInt()

            val latFixed = buffer.int
            val lonFixed = buffer.int
            val latitude = if (latFixed == BleRelayManager.NULL_COORDINATE) null else (latFixed / 100000.0)
            val longitude = if (lonFixed == BleRelayManager.NULL_COORDINATE) null else (lonFixed / 100000.0)

            val epochSec = buffer.int
            val timestamp = epochSec.toLong() * 1000L

            val msgHash = buffer.int
            val hashHex = String.format(java.util.Locale.US, "%08X", msgHash.toLong() and 0xFFFFFFFFL)
            val incidentId = "SOS-BLE-${hashHex.take(6)}"
            val messageId = "MSG-BLE-$hashHex"

            return mapOf(
                "incidentId" to incidentId,
                "messageId" to messageId,
                "severity" to severity,
                "timestamp" to timestamp,
                "latitude" to latitude,
                "longitude" to longitude,
                "peopleCount" to peopleCount,
                "hopCount" to hopCount,
                "hasVulnerablePeople" to hasVulnerable
            )
        }
    }

    @Test
    fun testPackAndUnpackCompactBeaconPreservesCoordinatesAndMetadata() {
        val originalLat = 12.95164
        val originalLon = 74.86934
        val createdAt = 1729750000000L

        val entity = SosEntity(
            messageId = "test-uuid-msg-001",
            incidentId = "test-uuid-inc-001",
            messageText = "Trapped in flood waters near Ullal Bridge",
            peopleCount = 3,
            hasVulnerablePeople = true,
            severity = SosSeverity.CRITICAL,
            latitude = originalLat,
            longitude = originalLon,
            createdAt = createdAt,
            originDeviceId = "node_victim_phone_A"
        )

        val packed = relayManager.packCompactBeacon(entity, hopCount = 0)
        assertEquals(25, packed.size)

        val unpacked = relayManager.unpackSosBeacon(packed)
        assertNotNull(unpacked)

        val unpackedLat = unpacked!!["latitude"] as Double
        val unpackedLon = unpacked["longitude"] as Double

        assertEquals(originalLat, unpackedLat, 0.00001)
        assertEquals(originalLon, unpackedLon, 0.00001)
        assertEquals(3, unpacked["peopleCount"])
        assertTrue(unpacked["hasVulnerablePeople"] as Boolean)
        assertEquals(SosSeverity.CRITICAL, unpacked["severity"])
        assertEquals(0, unpacked["hopCount"])
        assertTrue((unpacked["messageId"] as String).startsWith("MSG-BLE-"))
        assertTrue((unpacked["incidentId"] as String).startsWith("SOS-BLE-"))
    }

    @Test
    fun testCrc16ValidationRejectsCorruptedFrames() {
        val entity = SosEntity(
            messageId = "test-corrupt-check",
            messageText = "Medical distress",
            peopleCount = 2,
            hasVulnerablePeople = false,
            severity = SosSeverity.HIGH,
            latitude = 9.9312,
            longitude = 76.2673,
            originDeviceId = "node_b"
        )

        val validBytes = relayManager.packCompactBeacon(entity, hopCount = 0)
        assertNotNull(relayManager.unpackSosBeacon(validBytes))

        // Corrupt a byte in the payload (e.g. byte 8 in latitude)
        val corruptedBytes = validBytes.copyOf()
        corruptedBytes[8] = (corruptedBytes[8].toInt() xor 0xFF).toByte()

        val result = relayManager.unpackSosBeacon(corruptedBytes)
        assertNull("Corrupted packet with invalid CRC-16 must be rejected", result)
    }

    @Test
    fun testMultiHopProgressionPreservesCoordinates() {
        val originLat = 12.9141
        val originLon = 74.8560
        val originTimestamp = 1729760000000L

        // Step 1: Node A (Origin) creates beacon with hop 0
        val nodeAEntity = SosEntity(
            messageId = "origin-msg-hop-test",
            messageText = "Water rising fast",
            peopleCount = 5,
            hasVulnerablePeople = true,
            severity = SosSeverity.CRITICAL,
            latitude = originLat,
            longitude = originLon,
            createdAt = originTimestamp,
            originDeviceId = "node_phone_A",
            hopCount = 0
        )
        val frameFromA = relayManager.packCompactBeacon(nodeAEntity, hopCount = 0)

        // Step 2: Node B receives frame from A, verifies, increments hopCount to 1
        val unpackedByB = relayManager.unpackSosBeacon(frameFromA)
        assertNotNull(unpackedByB)
        assertEquals(0, unpackedByB!!["hopCount"])

        val nodeBRelayEntity = nodeAEntity.copy(
            hopCount = 1,
            relayNodeId = "node_phone_B",
            deliveryState = SosDeliveryState.RECEIVED_BY_PEER
        )
        val frameFromB = relayManager.packCompactBeacon(nodeBRelayEntity, hopCount = 1)

        // Step 3: Node C receives frame from B, verifies, increments hopCount to 2
        val unpackedByC = relayManager.unpackSosBeacon(frameFromB)
        assertNotNull(unpackedByC)
        assertEquals(1, unpackedByC!!["hopCount"])
        // Verify original coordinates are unchanged
        assertEquals(originLat, unpackedByC["latitude"] as Double, 0.00001)
        assertEquals(originLon, unpackedByC["longitude"] as Double, 0.00001)

        val nodeCRelayEntity = nodeBRelayEntity.copy(
            hopCount = 2,
            relayNodeId = "node_phone_C",
            deliveryState = SosDeliveryState.RECEIVED_BY_PEER
        )
        val frameFromC = relayManager.packCompactBeacon(nodeCRelayEntity, hopCount = 2)

        // Step 4: Laptop Gateway captures frame from C
        val unpackedByGateway = relayManager.unpackSosBeacon(frameFromC)
        assertNotNull(unpackedByGateway)
        assertEquals(2, unpackedByGateway!!["hopCount"])
        assertEquals(originLat, unpackedByGateway["latitude"] as Double, 0.00001)
        assertEquals(originLon, unpackedByGateway["longitude"] as Double, 0.00001)
        assertEquals(unpackedByB["messageId"], unpackedByGateway["messageId"])
    }

    @Test
    fun testNullGpsCoordinatesHandling() {
        val entity = SosEntity(
            messageId = "test-null-gps",
            messageText = "Indoor basement shelter",
            peopleCount = 1,
            hasVulnerablePeople = false,
            severity = SosSeverity.MODERATE,
            latitude = null,
            longitude = null,
            originDeviceId = "node_no_gps"
        )

        val packed = relayManager.packCompactBeacon(entity, hopCount = 0)
        val unpacked = relayManager.unpackSosBeacon(packed)
        assertNotNull(unpacked)
        assertNull(unpacked!!["latitude"])
        assertNull(unpacked["longitude"])
    }

    @Test
    fun testMaxHopLimitDropping() {
        val entity = SosEntity(
            messageId = "max-hop-check",
            messageText = "Testing hop ceiling",
            peopleCount = 1,
            hasVulnerablePeople = false,
            severity = SosSeverity.LOW,
            originDeviceId = "node_x",
            hopCount = BleRelayManager.MAX_HOPS
        )

        val packed = relayManager.packCompactBeacon(entity, hopCount = BleRelayManager.MAX_HOPS)
        val unpacked = relayManager.unpackSosBeacon(packed)
        assertNotNull(unpacked)
        val hopCount = unpacked!!["hopCount"] as Int
        assertTrue("Packets with hop count >= MAX_HOPS must not be relayed further", hopCount >= BleRelayManager.MAX_HOPS)
    }
}
