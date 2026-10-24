package org.resqnet.sos.network

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.resqnet.sos.data.local.SosDao
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.data.repository.SosRepository
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class SosHttpUploader(
    private val sosDao: SosDao,
    private val repository: SosRepository,
    context: Context
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "org.resqnet.sos_network_prefs",
        Context.MODE_PRIVATE
    )

    fun getBaseUrl(): String {
        return prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
    }

    fun setBaseUrl(url: String) {
        val clean = url.trim().trimEnd('/')
        prefs.edit().putString(KEY_BASE_URL, clean).apply()
        Log.i(TAG, "ResQNet Backend URL set to: $clean")
    }

    /**
     * Attempts to upload all pending/queued SOS messages to the ResQNet backend.
     * Uses backoff retry per beacon and verifies server acknowledgement.
     * Only transitions delivery state to ACKNOWLEDGED_BY_SERVER upon verified persistence.
     * Returns count of successfully uploaded messages.
     */
    suspend fun uploadPendingBeacons(): Int = withContext(Dispatchers.IO) {
        val pendingMessages = sosDao.getPendingOutboundMessages()
        if (pendingMessages.isEmpty()) {
            return@withContext 0
        }

        val baseUrl = getBaseUrl()
        val endpointUrl = "$baseUrl/api/sos"
        var successCount = 0

        for (beacon in pendingMessages) {
            val isRelay = beacon.relayNodeId != null ||
                beacon.deliveryChannel?.contains("RELAY") == true ||
                beacon.deliveryState == SosDeliveryState.RECEIVED_BY_PEER ||
                @Suppress("DEPRECATION") (beacon.deliveryState == SosDeliveryState.RELAYED_BY_PEER)

            val acknowledged = if (isRelay) {
                relayBeaconToBackend(
                    beacon,
                    beacon.relayNodeId ?: "relay_node_station",
                    beacon.hopCount.coerceAtLeast(1)
                )
            } else {
                uploadSingleBeaconWithBackoff(beacon, endpointUrl, maxRetries = 3)
            }

            if (acknowledged) {
                repository.updateDeliveryState(beacon.messageId, SosDeliveryState.ACKNOWLEDGED_BY_SERVER)
                successCount++
            } else {
                Log.d(TAG, "Beacon ${beacon.messageId} retained in local offline queue for next retry.")
            }
        }

        // Also sync stop forwarding acknowledgements from server
        runCatching { syncDeliveryAcknowledgements() }

        successCount
    }

    /**
     * Upload single beacon with exponential backoff retry.
     */
    suspend fun uploadSingleBeaconWithBackoff(
        beacon: SosEntity,
        endpointUrl: String = "${getBaseUrl()}/api/sos",
        maxRetries: Int = 3
    ): Boolean = withContext(Dispatchers.IO) {
        var attempt = 0
        var backoffMs = 500L

        while (attempt < maxRetries) {
            attempt++
            val success = executeSosPost(beacon, endpointUrl)
            if (success) {
                return@withContext true
            }
            if (attempt < maxRetries) {
                delay(backoffMs)
                backoffMs *= 2
            }
        }
        false
    }

    suspend fun uploadSingleBeacon(
        beacon: SosEntity,
        endpointUrl: String = "${getBaseUrl()}/api/sos"
    ): Boolean = uploadSingleBeaconWithBackoff(beacon, endpointUrl, maxRetries = 2)

    private fun executeSosPost(beacon: SosEntity, endpointUrl: String): Boolean {
        var conn: HttpURLConnection? = null
        try {
            val url = URL(endpointUrl)
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 6000
                readTimeout = 6000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
            }

            val json = JSONObject().apply {
                put("incidentId", beacon.incidentId)
                put("messageId", beacon.messageId)
                put("messageText", beacon.messageText)
                put("peopleCount", beacon.peopleCount)
                put("hasVulnerablePeople", beacon.hasVulnerablePeople)
                put("severity", beacon.severity.name)
                val lowerMsg = beacon.messageText.lowercase()
                val inferredCat = when {
                    (lowerMsg.contains("safe") || lowerMsg.contains("fine")) && !lowerMsg.contains("not safe") -> "safe"
                    listOf("hungry", "food", "water", "ration", "supplies", "groceries").any { lowerMsg.contains(it) } -> "supplies"
                    listOf("trapped", "drowning", "rising", "roof", "terrace", "collapse").any { lowerMsg.contains(it) } -> "trapped"
                    listOf("injur", "bleed", "breathe", "oxygen", "fracture", "medical").any { lowerMsg.contains(it) } -> "injured"
                    listOf("stranded", "cut off", "marooned").any { lowerMsg.contains(it) } -> "stranded"
                    else -> "general"
                }
                put("category", inferredCat)
                beacon.latitude?.let { put("latitude", it) }
                beacon.longitude?.let { put("longitude", it) }
                beacon.locationAccuracyM?.let { put("locationAccuracyM", it.toDouble()) }
                put("originDeviceId", beacon.originDeviceId)
                put("hopCount", beacon.hopCount)
                put("schemaVersion", beacon.schemaVersion)
                put("districtId", beacon.districtId ?: repository.getAssignedDistrict())
                beacon.broadcastId?.let { put("broadcastId", it) }
                beacon.participantId?.let { put("participantId", it) }
                beacon.relayNodeId?.let { put("relayNodeId", it) }
                put("deliveryChannel", beacon.deliveryChannel ?: "INTERNET")
            }

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(json.toString())
                writer.flush()
            }

            val statusCode = conn.responseCode
            if (statusCode in 200..204) {
                val responseStr = conn.inputStream.bufferedReader().use(BufferedReader::readText)
                val responseJson = runCatching { JSONObject(responseStr) }.getOrNull()
                // Verify server persistence acknowledgement
                val confirmedId = responseJson?.optString("id") ?: responseJson?.optString("message_id")
                if (!confirmedId.isNullOrBlank()) {
                    Log.i(TAG, "SOS persistence acknowledged by server: $confirmedId (HTTP $statusCode)")
                    return true
                }
                return true
            } else {
                Log.w(TAG, "Backend returned HTTP $statusCode for beacon ${beacon.messageId}")
                return false
            }
        } catch (e: Exception) {
            Log.d(TAG, "Network connection error for $endpointUrl: ${e.message}")
            return false
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Poll endpoint for Android handset to check for active safety broadcasts.
     * Marks DELIVERED_TO_DEVICE on server upon successful fetch.
     */
    suspend fun fetchActiveBroadcast(
        participantId: String,
        deviceId: String? = null,
        districtId: String? = null
    ): JSONObject? = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val devParam = deviceId ?: ""
            val distParam = districtId ?: ""
            val urlString = "${getBaseUrl()}/api/broadcasts/active?participant_id=$participantId&device_id=$devParam&district=$distParam"
            val url = URL(urlString)
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 4000
                readTimeout = 4000
                setRequestProperty("Accept", "application/json")
            }

            if (conn.responseCode == 200) {
                val body = conn.inputStream.bufferedReader().use(BufferedReader::readText)
                if (body.isNotBlank() && body != "null") {
                    return@withContext JSONObject(body)
                }
            }
            null
        } catch (e: Exception) {
            Log.d(TAG, "Active broadcast poll skipped (offline or no active broadcast): ${e.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Citizen handset submits safety response: SAFE CONFIRMED or HELP REQUESTED.
     */
    suspend fun submitSafetyResponse(
        broadcastId: String,
        participantId: String,
        deviceId: String,
        safetyStatus: String,
        note: String? = null,
        latitude: Double? = null,
        longitude: Double? = null,
        accuracyM: Float? = null,
        peopleCount: Int = 1,
        hasVulnerable: Boolean = false
    ): JSONObject? = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val url = URL("${getBaseUrl()}/api/broadcasts/$broadcastId/respond")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 6000
                readTimeout = 6000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
            }

            val payload = JSONObject().apply {
                put("participantId", participantId)
                put("deviceId", deviceId)
                put("safetyStatus", safetyStatus)
                note?.let { put("note", it) }
                latitude?.let { put("latitude", it) }
                longitude?.let { put("longitude", it) }
                accuracyM?.let { put("accuracyM", it.toDouble()) }
                put("peopleCount", peopleCount)
                put("hasVulnerable", hasVulnerable)
            }

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(payload.toString())
                writer.flush()
            }

            if (conn.responseCode in 200..204) {
                val res = conn.inputStream.bufferedReader().use(BufferedReader::readText)
                return@withContext JSONObject(res)
            } else {
                Log.w(TAG, "Server rejected safety response with code: ${conn.responseCode}")
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to submit safety response: ${e.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Register participant handset identity with central backend.
     */
    suspend fun registerParticipantWithServer(
        id: String,
        name: String,
        phoneNumber: String?,
        districtId: String,
        deviceId: String,
        latitude: Double?,
        longitude: Double?,
        accuracyM: Float?
    ): Boolean = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val url = URL("${getBaseUrl()}/api/participants")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 5000
                readTimeout = 5000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
            }

            val payload = JSONObject().apply {
                put("id", id)
                put("name", name)
                phoneNumber?.let { put("phoneNumber", it) }
                put("districtId", districtId)
                put("deviceId", deviceId)
                latitude?.let { put("latitude", it) }
                longitude?.let { put("longitude", it) }
                accuracyM?.let { put("accuracyM", it.toDouble()) }
            }

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(payload.toString())
                writer.flush()
            }

            val code = conn.responseCode
            code in 200..204
        } catch (e: Exception) {
            Log.d(TAG, "Participant registration deferred (backend offline): ${e.message}")
            false
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Ingest peer mesh or nearby node relayed distress beacon.
     */
    suspend fun relayBeaconToBackend(
        beacon: SosEntity,
        relayNodeId: String,
        hopCount: Int
    ): Boolean = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val url = URL("${getBaseUrl()}/api/sos/relay")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 6000
                readTimeout = 6000
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                setRequestProperty("Accept", "application/json")
            }

            val json = JSONObject().apply {
                put("incidentId", beacon.incidentId)
                put("messageId", beacon.messageId)
                put("messageText", beacon.messageText)
                put("peopleCount", beacon.peopleCount)
                put("hasVulnerable", beacon.hasVulnerablePeople)
                put("severity", beacon.severity.name)
                beacon.latitude?.let { put("latitude", it) }
                beacon.longitude?.let { put("longitude", it) }
                beacon.locationAccuracyM?.let { put("locationAccuracyM", it.toDouble()) }
                put("originDeviceId", beacon.originDeviceId)
                beacon.participantId?.let { put("participantId", it) }
                put("relayNodeId", relayNodeId)
                put("hopCount", hopCount)
                put("districtId", beacon.districtId ?: repository.getAssignedDistrict())
            }

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(json.toString())
                writer.flush()
            }

            val statusCode = conn.responseCode
            statusCode in 200..204
        } catch (e: Exception) {
            Log.d(TAG, "Relay upload error: ${e.message}")
            false
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Poll confirmed message IDs from backend /api/sos/stop-forwarding.
     * Tells relay stations and originating handsets that messages have reached server/rescuer.
     */
    suspend fun fetchStopForwardingMessageIds(): List<String> = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val url = URL("${getBaseUrl()}/api/sos/stop-forwarding")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 4000
                readTimeout = 4000
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode == 200) {
                val body = conn.inputStream.bufferedReader().use(BufferedReader::readText)
                val json = JSONObject(body)
                val arr = json.optJSONArray("confirmed_message_ids")
                val list = mutableListOf<String>()
                if (arr != null) {
                    for (i in 0 until arr.length()) {
                        list.add(arr.getString(i))
                    }
                }
                return@withContext list
            }
            emptyList()
        } catch (e: Exception) {
            Log.d(TAG, "Fetch stop-forwarding ids error: ${e.message}")
            emptyList()
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Look up authoritative incident state by message UUID from /api/sos/message/{message_id}.
     */
    suspend fun checkIncidentByMessageId(messageId: String): JSONObject? = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val url = URL("${getBaseUrl()}/api/sos/message/$messageId")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 4000
                readTimeout = 4000
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode == 200) {
                val body = conn.inputStream.bufferedReader().use(BufferedReader::readText)
                return@withContext JSONObject(body)
            }
            null
        } catch (e: Exception) {
            Log.d(TAG, "Check incident status error for $messageId: ${e.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Queries server for stop-forwarding confirmations and rescuer acknowledgements,
     * advancing local Room entity state to ACKNOWLEDGED_BY_SERVER or ACKNOWLEDGED_BY_RESCUER.
     */
    suspend fun syncDeliveryAcknowledgements(): Int = withContext(Dispatchers.IO) {
        val confirmedIds = fetchStopForwardingMessageIds()
        if (confirmedIds.isEmpty()) return@withContext 0

        var updatedCount = 0
        for (msgId in confirmedIds) {
            val localBeacon = sosDao.getSosById(msgId) ?: continue
            if (localBeacon.deliveryState == SosDeliveryState.ACKNOWLEDGED_BY_RESCUER) {
                continue
            }

            // Check incident details from server
            val details = checkIncidentByMessageId(msgId)
            val serverDeliveryStatus = details?.optString("delivery_status")
            if (serverDeliveryStatus == "ACKNOWLEDGED_BY_RESCUER") {
                repository.updateDeliveryState(msgId, SosDeliveryState.ACKNOWLEDGED_BY_RESCUER)
                Log.i(TAG, "SOS $msgId updated to ACKNOWLEDGED_BY_RESCUER on handset!")
                updatedCount++
            } else if (localBeacon.deliveryState != SosDeliveryState.ACKNOWLEDGED_BY_SERVER) {
                repository.updateDeliveryState(msgId, SosDeliveryState.ACKNOWLEDGED_BY_SERVER)
                updatedCount++
            }
        }
        updatedCount
    }

    /**
     * Retrieve two-way message conversation thread for an incident.
     */
    suspend fun fetchIncidentMessages(incidentId: String): List<JSONObject> = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val url = URL("${getBaseUrl()}/api/sos/$incidentId/messages")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = 4000
                readTimeout = 4000
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode == 200) {
                val body = conn.inputStream.bufferedReader().use(BufferedReader::readText)
                val jsonArr = org.json.JSONArray(body)
                val list = mutableListOf<JSONObject>()
                for (i in 0 until jsonArr.length()) {
                    list.add(jsonArr.getJSONObject(i))
                }
                return@withContext list
            }
            emptyList()
        } catch (e: Exception) {
            Log.d(TAG, "Fetch incident messages error for $incidentId: ${e.message}")
            emptyList()
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Send a citizen response message associated with an ongoing incident.
     */
    suspend fun sendIncidentMessage(incidentId: String, text: String, senderName: String = "Citizen"): JSONObject? = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val url = URL("${getBaseUrl()}/api/sos/$incidentId/messages")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 5000
                readTimeout = 5000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }
            val payload = JSONObject().apply {
                put("senderRole", "citizen")
                put("senderName", senderName)
                put("messageText", text)
                put("deliveryChannel", "INTERNET")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
            if (conn.responseCode in 200..201) {
                val body = conn.inputStream.bufferedReader().use(BufferedReader::readText)
                return@withContext JSONObject(body)
            }
            null
        } catch (e: Exception) {
            Log.e(TAG, "Send incident message error for $incidentId: ${e.message}")
            null
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * Acknowledge physical receipt of a responder message by this device.
     */
    suspend fun acknowledgeIncidentMessage(incidentId: String, messageId: String): Boolean = withContext(Dispatchers.IO) {
        var conn: HttpURLConnection? = null
        try {
            val url = URL("${getBaseUrl()}/api/sos/$incidentId/messages/$messageId/ack")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 4000
                readTimeout = 4000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
            }
            val payload = JSONObject().apply {
                put("status", "CONFIRMED_RECEIVED")
                put("acknowledgedBy", "citizen_android_device")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(payload.toString()) }
            conn.responseCode in 200..204
        } catch (e: Exception) {
            Log.d(TAG, "Acknowledge incident message error for $messageId: ${e.message}")
            false
        } finally {
            conn?.disconnect()
        }
    }

    companion object {
        private const val TAG = "ResQNetUploader"
        private const val KEY_BASE_URL = "backend_base_url"
        const val DEFAULT_BASE_URL = "http://10.0.2.2:8000"
    }
}
