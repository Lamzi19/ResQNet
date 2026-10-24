package org.resqnet.sos

import org.junit.Assert.*
import org.junit.Test
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.data.model.SosSeverity

class SosEntityTest {

    @Test
    fun testSosEntityCreationWithValidLocation() {
        val sos = SosEntity(
            messageText = "Trapped in floodwater on second floor",
            peopleCount = 4,
            hasVulnerablePeople = true,
            severity = SosSeverity.CRITICAL,
            latitude = 9.9312,
            longitude = 76.2673,
            locationAccuracyM = 6.5f,
            originDeviceId = "node_test_123"
        )

        assertEquals("Trapped in floodwater on second floor", sos.messageText)
        assertEquals(4, sos.peopleCount)
        assertTrue(sos.hasVulnerablePeople)
        assertEquals(SosSeverity.CRITICAL, sos.severity)
        assertTrue(sos.hasValidLocation)
        assertEquals(0, sos.hopCount)
        assertEquals(SosDeliveryState.SAVED_LOCALLY, sos.deliveryState)
        assertEquals("1.0.0", sos.schemaVersion)
        assertNotNull(sos.messageId)
        assertNotNull(sos.incidentId)
    }

    @Test
    fun testSosEntityWithoutLocation() {
        val sos = SosEntity(
            messageText = "GPS unavailable due to dense canopy",
            peopleCount = 1,
            hasVulnerablePeople = false,
            severity = SosSeverity.HIGH,
            latitude = null,
            longitude = null,
            originDeviceId = "node_test_456"
        )

        assertFalse(sos.hasValidLocation)
        assertNull(sos.latitude)
        assertNull(sos.longitude)
        assertEquals(SosDeliveryState.SAVED_LOCALLY, sos.deliveryState)
    }

    @Test
    fun testAllEightDeliveryStatesAndInvariants() {
        // Verify all 8 canonical states have honest display names
        assertEquals("Saved Locally", SosDeliveryState.SAVED_LOCALLY.displayName)
        assertEquals("Queued for Transmission", SosDeliveryState.QUEUED_FOR_TRANSMISSION.displayName)
        assertEquals("Transmitted to Peer", SosDeliveryState.TRANSMITTED_TO_PEER.displayName)
        assertEquals("Received by Peer", SosDeliveryState.RECEIVED_BY_PEER.displayName)
        assertEquals("Uploaded to Server", SosDeliveryState.UPLOADED_TO_SERVER.displayName)
        assertEquals("Server Acknowledged", SosDeliveryState.ACKNOWLEDGED_BY_SERVER.displayName)
        assertEquals("Rescuer Acknowledged", SosDeliveryState.ACKNOWLEDGED_BY_RESCUER.displayName)
        assertEquals("Expired / Undelivered", SosDeliveryState.FAILED_OR_EXPIRED.displayName)

        // Verify terminal & acknowledgement predicates
        assertTrue(SosDeliveryState.ACKNOWLEDGED_BY_RESCUER.isTerminal)
        assertTrue(SosDeliveryState.FAILED_OR_EXPIRED.isTerminal)
        assertFalse(SosDeliveryState.SAVED_LOCALLY.isTerminal)
        assertFalse(SosDeliveryState.ACKNOWLEDGED_BY_SERVER.isTerminal)

        assertTrue(SosDeliveryState.ACKNOWLEDGED_BY_SERVER.isAcknowledgedByServerOrHigher)
        assertTrue(SosDeliveryState.ACKNOWLEDGED_BY_RESCUER.isAcknowledgedByServerOrHigher)
        assertFalse(SosDeliveryState.UPLOADED_TO_SERVER.isAcknowledgedByServerOrHigher)
    }
}
