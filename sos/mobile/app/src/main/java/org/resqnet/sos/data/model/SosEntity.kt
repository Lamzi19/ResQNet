package org.resqnet.sos.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Room Entity representing a versioned emergency distress message.
 *
 * Persisted locally on the victim handset before any network or mesh
 * transmission attempt, guaranteeing persistence across process death or reboot.
 */
@Entity(tableName = "sos_messages")
data class SosEntity(
    @PrimaryKey
    val messageId: String = UUID.randomUUID().toString(),
    val incidentId: String = UUID.randomUUID().toString(),
    val schemaVersion: String = "1.0.0",
    val createdAt: Long = System.currentTimeMillis(),
    val expiresAt: Long? = System.currentTimeMillis() + (24 * 60 * 60 * 1000L), // Default 24h TTL
    val messageText: String,
    val peopleCount: Int = 1,
    val hasVulnerablePeople: Boolean = false,
    val severity: SosSeverity = SosSeverity.CRITICAL,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val locationAccuracyM: Float? = null,
    val locationTimestamp: Long? = null,
    val originDeviceId: String,
    val hopCount: Int = 0,
    val deliveryState: SosDeliveryState = SosDeliveryState.SAVED_LOCALLY,
    val lastUpdatedAt: Long = System.currentTimeMillis(),
    val districtId: String? = "ernakulam",
    val broadcastId: String? = null,
    val participantId: String? = null,
    val relayNodeId: String? = null,
    val deliveryChannel: String? = "INTERNET"
) {
    /**
     * True if valid GPS coordinates with non-null values are captured.
     */
    val hasValidLocation: Boolean
        get() = latitude != null && longitude != null
}
