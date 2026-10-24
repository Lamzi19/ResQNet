package org.resqnet.sos.data.repository

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.Flow
import org.resqnet.sos.data.local.SosDao
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.data.model.SosSeverity
import org.resqnet.sos.network.SosUploadWorker
import java.util.UUID

class SosRepository(
    private val sosDao: SosDao,
    private val context: Context
) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "org.resqnet.sos_preferences",
        Context.MODE_PRIVATE
    )

    /**
     * Get or generate a persistent anonymous device identifier.
     * Never uses hardware IMEI or MAC address for privacy protection.
     */
    fun getOrCreateDeviceId(): String {
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)
        if (deviceId == null) {
            deviceId = "node_" + UUID.randomUUID().toString().substring(0, 8)
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        }
        return deviceId
    }

    /**
     * Get or generate a persistent unique participant identifier for this installation.
     * Ensures every installation has its own identity rather than sharing one hardcoded id.
     */
    fun getOrCreateParticipantId(): String {
        var partId = prefs.getString(KEY_PARTICIPANT_ID, null)
        if (partId == null) {
            partId = "part_" + UUID.randomUUID().toString().substring(0, 8)
            prefs.edit().putString(KEY_PARTICIPANT_ID, partId).apply()
        }
        return partId
    }

    fun getParticipantName(): String {
        return prefs.getString(KEY_PARTICIPANT_NAME, "Citizen Handset") ?: "Citizen Handset"
    }

    fun getParticipantPhone(): String? {
        return prefs.getString(KEY_PARTICIPANT_PHONE, null)
    }

    fun getAssignedDistrict(): String {
        return prefs.getString(KEY_DISTRICT_ID, "ernakulam") ?: "ernakulam"
    }

    fun isRegistered(): Boolean {
        return prefs.getBoolean(KEY_IS_REGISTERED, false)
    }

    /**
     * Role selection: Citizen Mode (default) vs Responder / Relay Station Mode.
     */
    fun isResponderMode(): Boolean {
        return prefs.getBoolean(KEY_IS_RESPONDER_MODE, false)
    }

    fun setResponderMode(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_IS_RESPONDER_MODE, enabled).apply()
    }

    fun setParticipantProfile(
        id: String? = null,
        name: String,
        phone: String? = null,
        districtId: String = "ernakulam"
    ) {
        val finalId = id ?: getOrCreateParticipantId()
        prefs.edit()
            .putString(KEY_PARTICIPANT_ID, finalId)
            .putString(KEY_PARTICIPANT_NAME, name)
            .putString(KEY_PARTICIPANT_PHONE, phone)
            .putString(KEY_DISTRICT_ID, districtId)
            .putBoolean(KEY_IS_REGISTERED, true)
            .apply()
    }

    /**
     * Save an emergency distress message locally in Room before attempting transmission.
     */
    suspend fun createAndSaveSos(
        messageText: String,
        peopleCount: Int,
        hasVulnerablePeople: Boolean,
        severity: SosSeverity,
        latitude: Double?,
        longitude: Double?,
        accuracyM: Float?,
        locationTimestamp: Long?,
        districtId: String? = null,
        broadcastId: String? = null,
        participantId: String? = null,
        relayNodeId: String? = null,
        deliveryChannel: String? = "INTERNET"
    ): SosEntity {
        val now = System.currentTimeMillis()
        val incidentId = UUID.randomUUID().toString()
        val messageId = UUID.randomUUID().toString()
        val deviceId = getOrCreateDeviceId()
        val effectivePartId = participantId ?: getOrCreateParticipantId()
        val effectiveDistrict = districtId ?: if (latitude != null && longitude != null && latitude in 12.5..13.6 && longitude in 74.5..75.8) {
            "mangaluru_urban"
        } else if (latitude == null || longitude == null) {
            "unspecified"
        } else {
            getAssignedDistrict()
        }

        val entity = SosEntity(
            messageId = messageId,
            incidentId = incidentId,
            schemaVersion = "1.0.0",
            createdAt = now,
            expiresAt = now + (24 * 60 * 60 * 1000L), // 24 hour TTL
            messageText = messageText.trim(),
            peopleCount = peopleCount.coerceAtLeast(1),
            hasVulnerablePeople = hasVulnerablePeople,
            severity = severity,
            latitude = latitude,
            longitude = longitude,
            locationAccuracyM = accuracyM,
            locationTimestamp = locationTimestamp,
            originDeviceId = deviceId,
            hopCount = 0,
            deliveryState = SosDeliveryState.SAVED_LOCALLY,
            lastUpdatedAt = now,
            districtId = effectiveDistrict,
            broadcastId = broadcastId,
            participantId = effectivePartId,
            relayNodeId = relayNodeId,
            deliveryChannel = deliveryChannel
        )

        // Step 1: Save locally
        sosDao.insertSos(entity)

        // Step 2: Transition to waiting to transmit
        val queued = entity.copy(
            deliveryState = SosDeliveryState.WAITING_TO_TRANSMIT,
            lastUpdatedAt = System.currentTimeMillis()
        )
        sosDao.updateSos(queued)

        // Step 3: Trigger durable background deferred upload via WorkManager
        runCatching {
            SosUploadWorker.enqueueDeferredUpload(context)
        }

        return queued
    }

    /**
     * Ingest a peer beacon received over BLE / local mesh into Room for store-and-forward relay.
     * Guarantees deduplication, preserves original origin coordinates and timestamps,
     * and tags the local relay node ID.
     */
    suspend fun ingestPeerRelayBeacon(beacon: SosEntity): SosEntity {
        val existing = sosDao.getSosByMessageOrIncident(beacon.messageId)
            ?: sosDao.getSosByMessageOrIncident(beacon.incidentId)
        if (existing != null) {
            return existing
        }

        val myDeviceId = getOrCreateDeviceId()
        val relayed = beacon.copy(
            deliveryState = SosDeliveryState.RECEIVED_BY_PEER,
            relayNodeId = myDeviceId,
            lastUpdatedAt = System.currentTimeMillis(),
            deliveryChannel = "BLE_MESH_RELAY"
        )
        sosDao.insertSos(relayed)

        // Enqueue WorkManager upload
        runCatching {
            SosUploadWorker.enqueueDeferredUpload(context)
        }

        return relayed
    }

    suspend fun getEligibleRelayMessages(): List<SosEntity> = sosDao.getEligibleRelayMessages()

    suspend fun getSosByMessageOrIncident(id: String): SosEntity? = sosDao.getSosByMessageOrIncident(id)

    fun getAllSosFlow(): Flow<List<SosEntity>> = sosDao.getAllSosFlow()

    fun getPendingCountFlow(): Flow<Int> = sosDao.getPendingCountFlow()

    fun getRelayedBeaconsFlow(): Flow<List<SosEntity>> = sosDao.getRelayedBeaconsFlow()

    fun getReceivedPeerCountFlow(): Flow<Int> = sosDao.getReceivedPeerCountFlow()

    fun getConfirmedCountFlow(): Flow<Int> = sosDao.getConfirmedCountFlow()

    suspend fun getSosById(messageId: String): SosEntity? = sosDao.getSosById(messageId)

    suspend fun updateDeliveryState(messageId: String, newState: SosDeliveryState) {
        sosDao.updateDeliveryState(messageId, newState, System.currentTimeMillis())
    }

    companion object {
        private const val KEY_DEVICE_ID = "anonymous_device_id"
        private const val KEY_PARTICIPANT_ID = "participant_id"
        private const val KEY_PARTICIPANT_NAME = "participant_name"
        private const val KEY_PARTICIPANT_PHONE = "participant_phone"
        private const val KEY_DISTRICT_ID = "district_id"
        private const val KEY_IS_REGISTERED = "is_registered"
        private const val KEY_IS_RESPONDER_MODE = "is_responder_mode"
    }
}
