package org.resqnet.sos.data.model

/**
 * Honest delivery states for ResQNet SOS distress beacons.
 *
 * DESIGN INVARIANT:
 * Never mark a message as DELIVERED or ACKNOWLEDGED merely because it was
 * queued, saved locally, or transmitted via Bluetooth advertising.
 * Distinguish local storage, BLE transmission, laptop receipt, backend persistence,
 * and authoritative human rescuer acknowledgement.
 */
enum class SosDeliveryState(val displayName: String, val detailedStatus: String) {
    // 1. Persisted locally in handset SQLite Room database
    SAVED_LOCALLY(
        displayName = "Saved Locally",
        detailedStatus = "Persisted securely in device storage. Preparing broadcast."
    ),

    // 2. Waiting for transmission or gateway
    WAITING_TO_TRANSMIT(
        displayName = "Waiting to Transmit",
        detailedStatus = "In queue waiting for local Bluetooth broadcast or internet gateway."
    ),
    QUEUED_FOR_TRANSMISSION(
        displayName = "Queued for Transmission",
        detailedStatus = "In transmission queue awaiting local peer discovery or gateway."
    ),

    // 3. Actively transmitting over Bluetooth Low Energy
    BLE_TRANSMITTED(
        displayName = "BLE Transmitted",
        detailedStatus = "Actively broadcasting 56-byte distress beacon via Bluetooth LE."
    ),
    TRANSMITTED_TO_PEER(
        displayName = "Transmitted to Peer",
        detailedStatus = "Broadcast via BLE to a neighboring handset."
    ),

    // 4. Ingested by a neighboring handset or laptop BLE receiver
    RECEIVED_BY_LAPTOP(
        displayName = "Received by Laptop",
        detailedStatus = "Distress beacon captured by rescuer laptop BLE gateway."
    ),
    RECEIVED_BY_PEER(
        displayName = "Received by Peer",
        detailedStatus = "Received from another handset. Moving through local mesh relay."
    ),

    // 5. Transmitted to gateway
    UPLOADED_TO_SERVER(
        displayName = "Uploaded to Server",
        detailedStatus = "Transmitted to central server gateway. Awaiting verified write ack."
    ),

    // 6. Persisted in backend SQLite database
    PERSISTED_BY_BACKEND(
        displayName = "Persisted by Backend",
        detailedStatus = "Verified and stored in SQLite database. Visible on rescuer command dashboard."
    ),
    ACKNOWLEDGED_BY_SERVER(
        displayName = "Server Acknowledged",
        detailedStatus = "Persisted and indexed in incident database. In emergency queue."
    ),

    // 7. Tactical rescue commander / boat crew has formally verified and accepted the dispatch
    ACKNOWLEDGED_BY_RESCUER(
        displayName = "Rescuer Acknowledged",
        detailedStatus = "Dispatched and verified by emergency rescue team. Help is en route."
    ),

    // 8. Transmission failed or expired
    DELIVERY_FAILED(
        displayName = "Delivery Failed",
        detailedStatus = "Unable to transmit or deliver distress beacon to gateway."
    ),
    FAILED_OR_EXPIRED(
        displayName = "Expired / Undelivered",
        detailedStatus = "Distress beacon time-to-live elapsed before reaching a gateway."
    ),

    // Backward-compatibility aliases for legacy persisted database strings & existing unit tests:
    @Deprecated("Use WAITING_TO_TRANSMIT", ReplaceWith("WAITING_TO_TRANSMIT"))
    QUEUED_OFFLINE(
        displayName = "Queued Offline",
        detailedStatus = "In transmission queue awaiting local peer discovery or gateway."
    ),
    @Deprecated("Use RECEIVED_BY_PEER", ReplaceWith("RECEIVED_BY_PEER"))
    RELAYED_BY_PEER(
        displayName = "Relayed by Peer",
        detailedStatus = "Forwarded to a neighboring handset. Moving through mesh."
    ),
    @Deprecated("Use UPLOADED_TO_SERVER", ReplaceWith("UPLOADED_TO_SERVER"))
    UPLOADED_TO_BACKEND(
        displayName = "Uploaded to Server",
        detailedStatus = "Reached ResQNet gateway via internet. Awaiting command ack."
    ),
    @Deprecated("Use ACKNOWLEDGED_BY_RESCUER", ReplaceWith("ACKNOWLEDGED_BY_RESCUER"))
    DELIVERED_CONFIRMED(
        displayName = "Delivered to Rescuer",
        detailedStatus = "Dispatched and confirmed by emergency rescue team."
    ),
    @Deprecated("Use FAILED_OR_EXPIRED", ReplaceWith("FAILED_OR_EXPIRED"))
    FAILED_EXPIRED(
        displayName = "Expired / Undelivered",
        detailedStatus = "Beacon time-to-live elapsed before reaching a gateway."
    );

    val isTerminal: Boolean
        get() = this == ACKNOWLEDGED_BY_RESCUER || this == DELIVERED_CONFIRMED || this == FAILED_OR_EXPIRED || this == FAILED_EXPIRED || this == DELIVERY_FAILED

    val isAcknowledgedByServerOrHigher: Boolean
        get() = this == ACKNOWLEDGED_BY_SERVER || this == PERSISTED_BY_BACKEND || this == ACKNOWLEDGED_BY_RESCUER || this == DELIVERED_CONFIRMED
}
