package org.resqnet.sos.network

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.resqnet.sos.data.local.SosDatabase
import org.resqnet.sos.data.repository.SosRepository
import java.util.concurrent.TimeUnit

/**
 * Background WorkManager worker providing durable, guaranteed SOS upload retry.
 *
 * Guarantees that distress signals created or queued offline are transmitted
 * to the ResQNet backend gateway as soon as the handset regains internet connectivity
 * (Wi-Fi, 4G, 5G, or mesh edge uplink), even across application restarts.
 */
class SosUploadWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        Log.i(TAG, "SosUploadWorker started background sync execution...")
        return try {
            val database = SosDatabase.getInstance(applicationContext)
            val dao = database.sosDao()
            val repository = SosRepository(dao, applicationContext)
            val uploader = SosHttpUploader(dao, repository, applicationContext)

            // 1. Upload all pending local outbound and relayed beacons
            val uploadedCount = uploader.uploadPendingBeacons()
            Log.i(TAG, "SosUploadWorker uploaded $uploadedCount distress beacons.")

            // 2. Sync stop-forwarding and rescuer acknowledgements from server
            val syncedAcks = uploader.syncDeliveryAcknowledgements()
            Log.i(TAG, "SosUploadWorker synced $syncedAcks delivery acknowledgements.")

            // If there are still pending messages, request backoff retry
            val pendingMessages = dao.getPendingOutboundMessages()
            if (pendingMessages.isNotEmpty()) {
                Log.d(TAG, "${pendingMessages.size} beacons still pending. Scheduling WorkManager retry.")
                Result.retry()
            } else {
                Result.success()
            }
        } catch (e: Exception) {
            Log.w(TAG, "SosUploadWorker encountered transient error: ${e.message}")
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "SosUploadWorker"
        const val UNIQUE_WORK_NAME = "resqnet_sos_deferred_upload"

        /**
         * Enqueues durable background upload constrained to when network connectivity is available.
         */
        fun enqueueDeferredUpload(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val workRequest = OneTimeWorkRequestBuilder<SosUploadWorker>()
                .setConstraints(constraints)
                .setInitialDelay(2, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                UNIQUE_WORK_NAME,
                ExistingWorkPolicy.KEEP,
                workRequest
            )
            Log.d(TAG, "Deferred SOS upload enqueued with NetworkType.CONNECTED constraint.")
        }

        /**
         * Enqueues immediate execution (e.g. on manual user sync click or when network is present).
         */
        fun enqueueImmediateSync(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val workRequest = OneTimeWorkRequestBuilder<SosUploadWorker>()
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context.applicationContext).enqueueUniqueWork(
                UNIQUE_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                workRequest
            )
            Log.d(TAG, "Immediate SOS sync enqueued via WorkManager.")
        }
    }
}
