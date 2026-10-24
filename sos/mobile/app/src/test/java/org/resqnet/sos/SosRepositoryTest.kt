package org.resqnet.sos

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.resqnet.sos.data.local.SosDao
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.data.model.SosSeverity

class FakeSosDao : SosDao {
    private val storage = mutableMapOf<String, SosEntity>()

    override suspend fun insertSos(sos: SosEntity) {
        storage[sos.messageId] = sos
    }

    override suspend fun updateSos(sos: SosEntity) {
        storage[sos.messageId] = sos
    }

    override suspend fun updateDeliveryState(messageId: String, newState: SosDeliveryState, updatedAt: Long) {
        val existing = storage[messageId]
        if (existing != null) {
            storage[messageId] = existing.copy(deliveryState = newState, lastUpdatedAt = updatedAt)
        }
    }

    override fun getAllSosFlow(): Flow<List<SosEntity>> {
        return flowOf(storage.values.toList().sortedByDescending { it.createdAt })
    }

    override suspend fun getSosById(messageId: String): SosEntity? {
        return storage[messageId]
    }

    override fun getSosByIncidentFlow(incidentId: String): Flow<List<SosEntity>> {
        return flowOf(storage.values.filter { it.incidentId == incidentId })
    }

    override fun getPendingCountFlow(): Flow<Int> {
        val count = storage.values.count {
            it.deliveryState in listOf(
                SosDeliveryState.SAVED_LOCALLY,
                SosDeliveryState.QUEUED_OFFLINE,
                SosDeliveryState.RELAYED_BY_PEER
            )
        }
        return flowOf(count)
    }

    override suspend fun getPendingOutboundMessages(): List<SosEntity> {
        return storage.values.filter {
            it.deliveryState in listOf(
                SosDeliveryState.SAVED_LOCALLY,
                SosDeliveryState.QUEUED_OFFLINE
            )
        }
    }

    override fun getRelayedBeaconsFlow(): Flow<List<SosEntity>> {
        return flowOf(storage.values.filter {
            it.deliveryState in listOf(
                SosDeliveryState.RECEIVED_BY_PEER,
                @Suppress("DEPRECATION") SosDeliveryState.RELAYED_BY_PEER
            ) || it.relayNodeId != null
        })
    }

    override fun getReceivedPeerCountFlow(): Flow<Int> {
        val count = storage.values.count {
            it.deliveryState in listOf(
                SosDeliveryState.RECEIVED_BY_PEER,
                @Suppress("DEPRECATION") SosDeliveryState.RELAYED_BY_PEER
            )
        }
        return flowOf(count)
    }

    override fun getConfirmedCountFlow(): Flow<Int> {
        val count = storage.values.count {
            it.deliveryState in listOf(
                SosDeliveryState.ACKNOWLEDGED_BY_SERVER,
                SosDeliveryState.ACKNOWLEDGED_BY_RESCUER,
                @Suppress("DEPRECATION") SosDeliveryState.DELIVERED_CONFIRMED
            )
        }
        return flowOf(count)
    }

    override suspend fun getEligibleRelayMessages(): List<SosEntity> {
        return storage.values.filter {
            it.deliveryState in listOf(
                SosDeliveryState.SAVED_LOCALLY,
                SosDeliveryState.WAITING_TO_TRANSMIT,
                SosDeliveryState.BLE_TRANSMITTED,
                SosDeliveryState.RECEIVED_BY_PEER,
                SosDeliveryState.TRANSMITTED_TO_PEER
            ) && it.hopCount < 3
        }
    }

    override suspend fun getSosByMessageOrIncident(id: String): SosEntity? {
        return storage[id] ?: storage.values.find { it.incidentId == id || it.messageId == id }
    }

    override suspend fun deleteSosById(messageId: String) {
        storage.remove(messageId)
    }
}

class SosRepositoryTest {

    @Test
    fun testCreateAndSaveSosSavesToDaoAndQueuesOffline() = runBlocking {
        val fakeDao = FakeSosDao()
        val now = System.currentTimeMillis()

        val entity = SosEntity(
            messageId = "msg_001",
            incidentId = "inc_001",
            messageText = "Rising waters at Aluva bridge",
            peopleCount = 3,
            hasVulnerablePeople = true,
            severity = SosSeverity.CRITICAL,
            latitude = 10.1076,
            longitude = 76.3516,
            locationAccuracyM = 12.0f,
            originDeviceId = "node_aluva_1",
            deliveryState = SosDeliveryState.SAVED_LOCALLY,
            createdAt = now
        )

        fakeDao.insertSos(entity)
        val saved = fakeDao.getSosById("msg_001")
        assertNotNull(saved)
        assertEquals(SosDeliveryState.SAVED_LOCALLY, saved?.deliveryState)

        // Test transition to QUEUED_OFFLINE
        fakeDao.updateDeliveryState("msg_001", SosDeliveryState.QUEUED_OFFLINE, now + 100)
        val queued = fakeDao.getSosById("msg_001")
        assertEquals(SosDeliveryState.QUEUED_OFFLINE, queued?.deliveryState)
    }

    @Test
    fun testPendingCountAccuratelyIncludesOfflineQueued() = runBlocking {
        val fakeDao = FakeSosDao()

        fakeDao.insertSos(
            SosEntity(
                messageId = "1",
                messageText = "Help 1",
                originDeviceId = "d1",
                deliveryState = SosDeliveryState.QUEUED_OFFLINE
            )
        )
        fakeDao.insertSos(
            SosEntity(
                messageId = "2",
                messageText = "Help 2",
                originDeviceId = "d1",
                deliveryState = SosDeliveryState.RELAYED_BY_PEER
            )
        )
        fakeDao.insertSos(
            SosEntity(
                messageId = "3",
                messageText = "Help 3",
                originDeviceId = "d1",
                deliveryState = SosDeliveryState.ACKNOWLEDGED_BY_SERVER
            )
        )

        val pending = fakeDao.getPendingOutboundMessages()
        // Only message 1 is QUEUED_OFFLINE (message 2 is RELAYED, message 3 is ACKNOWLEDGED)
        assertEquals(1, pending.size)
        assertEquals("1", pending[0].messageId)
    }
}
