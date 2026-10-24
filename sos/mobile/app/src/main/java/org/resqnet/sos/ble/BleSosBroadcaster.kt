package org.resqnet.sos.ble

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.data.model.SosSeverity
import org.resqnet.sos.data.repository.SosRepository
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID

/**
 * Genuine Bluetooth Low Energy (BLE) distress beacon broadcaster for offline handsets.
 *
 * Transmits compact 25-byte distress frames using standard Bluetooth LE Advertisements
 * under Service UUID 0000FE50-0000-1000-8000-00805F9B34FB.
 *
 * Any rescuer laptop or relay node running the ResQNet BLE receiver can capture this
 * transmission over the air without requiring cellular network, Wi-Fi, or internet access.
 */
class BleSosBroadcaster(
    private val context: Context,
    private val repository: SosRepository
) {
    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter
    private var advertiser: BluetoothLeAdvertiser? = null

    private var activeCallback: AdvertiseCallback? = null
    private var activeMessageId: String? = null

    val isBluetoothEnabled: Boolean
        get() = bluetoothAdapter?.isEnabled == true

    val isAdvertisingSupported: Boolean
        get() = bluetoothAdapter?.isMultipleAdvertisementSupported == true

    /**
     * Encode an SosEntity into the canonical 25-byte binary distress frame.
     */
    fun encodeDistressBeacon(beacon: SosEntity): ByteArray {
        val buffer = ByteBuffer.allocate(25).order(ByteOrder.BIG_ENDIAN)

        // 1. Magic bytes: 'R', 'Q' (0x52, 0x51)
        buffer.put(0x52.toByte())
        buffer.put(0x51.toByte())

        // 2. Protocol Version: 0x01
        buffer.put(0x01.toByte())

        // 3. Severity (0: LOW, 1: MODERATE, 2: HIGH, 3: CRITICAL)
        val sevCode = when (beacon.severity) {
            SosSeverity.LOW -> 0
            SosSeverity.MODERATE -> 1
            SosSeverity.HIGH -> 2
            SosSeverity.CRITICAL -> 3
        }.toByte()
        buffer.put(sevCode)

        // 4. Stranded People Count (1-255)
        buffer.put(beacon.peopleCount.coerceIn(1, 255).toByte())

        // 5. Vulnerability & Category Flags (bit 0 = hasVulnerable, bits 1-3 = category)
        val lowerText = beacon.messageText.lowercase()
        val catCode = when {
            (lowerText.contains("safe") || lowerText.contains("fine")) && !lowerText.contains("not safe") -> 5
            listOf("hungry", "food", "water", "ration", "supplies", "groceries").any { lowerText.contains(it) } -> 4
            listOf("stranded", "cut off", "marooned").any { lowerText.contains(it) } -> 3
            listOf("injur", "bleed", "breathe", "oxygen", "fracture", "medical").any { lowerText.contains(it) } -> 2
            listOf("trapped", "drowning", "rising", "roof", "terrace", "collapse").any { lowerText.contains(it) } -> 1
            else -> 0
        }
        var flags: Byte = ((catCode shl 1) and 0x0E).toByte()
        if (beacon.hasVulnerablePeople) flags = (flags.toInt() or 0x01).toByte()
        buffer.put(flags)

        // 6. Hop Count (0 for originating phone)
        buffer.put(beacon.hopCount.coerceIn(0, 10).toByte())

        // 7. Latitude: Fixed-point int32 (degrees * 100,000) or 0x7FFFFFFF if GPS unavailable
        val latFixed = if (beacon.latitude != null) {
            (beacon.latitude * 100000.0).toInt()
        } else {
            0x7FFFFFFF
        }
        buffer.putInt(latFixed)

        // 8. Longitude: Fixed-point int32 (degrees * 100,000) or 0x7FFFFFFF if GPS unavailable
        val lonFixed = if (beacon.longitude != null) {
            (beacon.longitude * 100000.0).toInt()
        } else {
            0x7FFFFFFF
        }
        buffer.putInt(lonFixed)

        // 9. Timestamp: UTC Epoch Seconds
        val timestampSec = (beacon.createdAt / 1000L).toInt()
        buffer.putInt(timestampSec)

        // 10. Message ID Hash (4 bytes derived from message UUID)
        val msgHash = beacon.messageId.hashCode()
        buffer.putInt(msgHash)

        // 11. CRC-16 Checksum over preceding 23 bytes
        val bytes = buffer.array()
        val crc = computeCrc16(bytes, 0, 23)
        buffer.putShort(crc)

        return bytes
    }

    /**
     * Broadcast an emergency distress beacon over Bluetooth Low Energy.
     */
    @SuppressLint("MissingPermission")
    fun startBroadcasting(
        beacon: SosEntity,
        onStatusChanged: (success: Boolean, message: String) -> Unit
    ) {
        if (!isBluetoothEnabled) {
            onStatusChanged(false, "Bluetooth is turned off. Please enable Bluetooth.")
            return
        }

        advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
        if (advertiser == null) {
            onStatusChanged(false, "Bluetooth LE Advertising is not supported by this device hardware.")
            return
        }

        // Stop any previous active broadcast
        stopBroadcasting()

        val payload = encodeDistressBeacon(beacon)
        val pUuid = ParcelUuid(SERVICE_UUID)

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(false)
            .setTimeout(0) // Continuous broadcast until confirmed or cancelled
            .build()

        // Legacy BLE packets have a 31-byte maximum length.
        // addServiceData takes 29 bytes. addServiceUuid would add 4 bytes (total 33), causing ADVERTISE_FAILED_DATA_TOO_LARGE.
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceData(pUuid, payload)
            .build()

        val callback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                Log.i(TAG, "★ BLE Distress Beacon Broadcast ACTIVE for message ${beacon.messageId}")
                activeMessageId = beacon.messageId
                onStatusChanged(true, "BLE Beacon active. Transmitting to nearby laptop receiver.")
            }

            override fun onStartFailure(errorCode: Int) {
                val errorMsg = when (errorCode) {
                    ADVERTISE_FAILED_ALREADY_STARTED -> "Advertising already active"
                    ADVERTISE_FAILED_DATA_TOO_LARGE -> "Packet size exceeded BLE limit"
                    ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "BLE advertising unsupported"
                    ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal Bluetooth radio error"
                    ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many active BLE advertisers"
                    else -> "BLE Advertising failed with code $errorCode"
                }
                Log.w(TAG, "BLE advertising failed: $errorMsg")
                onStatusChanged(false, errorMsg)
            }
        }

        activeCallback = callback
        try {
            advertiser?.startAdvertising(settings, data, callback)
        } catch (e: SecurityException) {
            Log.e(TAG, "Missing BLUETOOTH_ADVERTISE permission: ${e.message}")
            onStatusChanged(false, "Bluetooth permission required to broadcast distress signal.")
        } catch (e: Exception) {
            Log.e(TAG, "Exception starting BLE broadcast: ${e.message}")
            onStatusChanged(false, "Failed to start BLE broadcast: ${e.message}")
        }
    }

    /**
     * Stop active Bluetooth LE distress advertising.
     */
    @SuppressLint("MissingPermission")
    fun stopBroadcasting() {
        val cb = activeCallback ?: return
        try {
            advertiser?.stopAdvertising(cb)
            Log.i(TAG, "BLE Distress Beacon stopped for message $activeMessageId")
        } catch (e: Exception) {
            Log.w(TAG, "Error stopping BLE advertiser: ${e.message}")
        } finally {
            activeCallback = null
            activeMessageId = null
        }
    }

    companion object {
        private const val TAG = "ResQNetBle"

        // Official ResQNet 16-bit short Service UUID FE50
        val SERVICE_UUID: UUID = UUID.fromString("0000FE50-0000-1000-8000-00805F9B34FB")

        private fun computeCrc16(data: ByteArray, offset: Int, length: Int): Short {
            var crc = 0xFFFF
            for (i in offset until (offset + length)) {
                crc = crc xor (data[i].toInt() and 0xFF)
                for (j in 0 until 8) {
                    if ((crc and 0x0001) != 0) {
                        crc = (crc ushr 1) xor 0xA001
                    } else {
                        crc = crc ushr 1
                    }
                }
            }
            return crc.toShort()
        }
    }
}
