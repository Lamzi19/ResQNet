package org.resqnet.sos.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity

@Dao
interface SosDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSos(sos: SosEntity)

    @Update
    suspend fun updateSos(sos: SosEntity)

    @Query("UPDATE sos_messages SET deliveryState = :newState, lastUpdatedAt = :updatedAt WHERE messageId = :messageId")
    suspend fun updateDeliveryState(messageId: String, newState: SosDeliveryState, updatedAt: Long)

    @Query("SELECT * FROM sos_messages ORDER BY createdAt DESC")
    fun getAllSosFlow(): Flow<List<SosEntity>>

    @Query("SELECT * FROM sos_messages WHERE messageId = :messageId LIMIT 1")
    suspend fun getSosById(messageId: String): SosEntity?

    @Query("SELECT * FROM sos_messages WHERE incidentId = :incidentId ORDER BY createdAt DESC")
    fun getSosByIncidentFlow(incidentId: String): Flow<List<SosEntity>>

    @Query("SELECT COUNT(*) FROM sos_messages WHERE deliveryState IN ('SAVED_LOCALLY', 'WAITING_TO_TRANSMIT', 'BLE_TRANSMITTED', 'QUEUED_OFFLINE', 'QUEUED_FOR_TRANSMISSION', 'RELAYED_BY_PEER', 'RECEIVED_BY_PEER', 'TRANSMITTED_TO_PEER')")
    fun getPendingCountFlow(): Flow<Int>

    @Query("SELECT * FROM sos_messages WHERE deliveryState IN ('SAVED_LOCALLY', 'WAITING_TO_TRANSMIT', 'BLE_TRANSMITTED', 'QUEUED_OFFLINE', 'QUEUED_FOR_TRANSMISSION', 'RECEIVED_BY_PEER', 'RELAYED_BY_PEER', 'TRANSMITTED_TO_PEER') ORDER BY createdAt ASC")
    suspend fun getPendingOutboundMessages(): List<SosEntity>

    @Query("SELECT * FROM sos_messages WHERE deliveryState IN ('SAVED_LOCALLY', 'WAITING_TO_TRANSMIT', 'BLE_TRANSMITTED', 'RECEIVED_BY_PEER', 'TRANSMITTED_TO_PEER') AND hopCount < 3 ORDER BY createdAt ASC")
    suspend fun getEligibleRelayMessages(): List<SosEntity>

    @Query("SELECT * FROM sos_messages WHERE messageId = :id OR incidentId = :id LIMIT 1")
    suspend fun getSosByMessageOrIncident(id: String): SosEntity?

    @Query("SELECT * FROM sos_messages WHERE deliveryState IN ('RECEIVED_BY_PEER', 'RELAYED_BY_PEER') OR relayNodeId IS NOT NULL ORDER BY createdAt DESC")
    fun getRelayedBeaconsFlow(): Flow<List<SosEntity>>

    @Query("SELECT COUNT(*) FROM sos_messages WHERE deliveryState IN ('RECEIVED_BY_PEER', 'RELAYED_BY_PEER')")
    fun getReceivedPeerCountFlow(): Flow<Int>

    @Query("SELECT COUNT(*) FROM sos_messages WHERE deliveryState IN ('ACKNOWLEDGED_BY_SERVER', 'ACKNOWLEDGED_BY_RESCUER', 'DELIVERED_CONFIRMED')")
    fun getConfirmedCountFlow(): Flow<Int>

    @Query("DELETE FROM sos_messages WHERE messageId = :messageId")
    suspend fun deleteSosById(messageId: String)
}
