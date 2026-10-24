package org.resqnet.sos.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverter
import androidx.room.TypeConverters
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.data.model.SosSeverity

class Converters {
    @TypeConverter
    fun fromSeverity(severity: SosSeverity): String = severity.name

    @TypeConverter
    fun toSeverity(value: String): SosSeverity = runCatching {
        SosSeverity.valueOf(value)
    }.getOrDefault(SosSeverity.CRITICAL)

    @TypeConverter
    fun fromDeliveryState(state: SosDeliveryState): String = state.name

    @TypeConverter
    fun toDeliveryState(value: String): SosDeliveryState = runCatching {
        SosDeliveryState.valueOf(value)
    }.getOrDefault(SosDeliveryState.SAVED_LOCALLY)
}

@Database(
    entities = [SosEntity::class],
    version = 2,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class SosDatabase : RoomDatabase() {

    abstract fun sosDao(): SosDao

    companion object {
        @Volatile
        private var INSTANCE: SosDatabase? = null

        fun getInstance(context: Context): SosDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    SosDatabase::class.java,
                    "resqnet_sos_db"
                ).fallbackToDestructiveMigration().build()
                INSTANCE = instance
                instance
            }
        }
    }
}
