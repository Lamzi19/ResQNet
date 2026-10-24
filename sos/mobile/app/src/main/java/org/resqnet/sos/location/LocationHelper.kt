package org.resqnet.sos.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

sealed class LocationState {
    object Idle : LocationState()
    object Acquiring : LocationState()
    data class Success(val snapshot: LocationSnapshot) : LocationState()
    data class Error(val reason: LocationErrorReason, val message: String) : LocationState()
}

enum class LocationErrorReason {
    PERMISSION_DENIED,
    GPS_HARDWARE_DISABLED,
    NO_FIX_AVAILABLE
}

data class LocationSnapshot(
    val latitude: Double,
    val longitude: Double,
    val accuracyM: Float,
    val timestamp: Long
)

class LocationHelper(private val context: Context) {

    private val fusedClient: FusedLocationProviderClient by lazy {
        LocationServices.getFusedLocationProviderClient(context)
    }

    /**
     * Checks if fine or coarse location permissions are granted.
     */
    fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        return fine || coarse
    }

    /**
     * Checks if GPS or Network location providers are enabled on the device.
     */
    fun isLocationServiceEnabled(): Boolean {
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        return lm != null && (
            lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        )
    }

    /**
     * Asynchronously captures the freshest available high-accuracy GPS fix.
     * Never fabricates fake/default coordinates.
     */
    suspend fun captureCurrentLocation(): LocationState {
        if (!hasLocationPermission()) {
            return LocationState.Error(
                reason = LocationErrorReason.PERMISSION_DENIED,
                message = "Location permission is not granted. Please allow location access."
            )
        }

        if (!isLocationServiceEnabled()) {
            return LocationState.Error(
                reason = LocationErrorReason.GPS_HARDWARE_DISABLED,
                message = "Device GPS / Location Services are turned off. Please enable GPS in Settings."
            )
        }

        return try {
            val location = fetchFusedLocation()
            if (location != null) {
                LocationState.Success(
                    LocationSnapshot(
                        latitude = location.latitude,
                        longitude = location.longitude,
                        accuracyM = location.accuracy,
                        timestamp = location.time
                    )
                )
            } else {
                LocationState.Error(
                    reason = LocationErrorReason.NO_FIX_AVAILABLE,
                    message = "Unable to acquire GPS fix. Device may be indoors or obstructed."
                )
            }
        } catch (e: SecurityException) {
            LocationState.Error(
                reason = LocationErrorReason.PERMISSION_DENIED,
                message = "Security exception querying location: ${e.message}"
            )
        } catch (e: Exception) {
            LocationState.Error(
                reason = LocationErrorReason.NO_FIX_AVAILABLE,
                message = "Location acquisition error: ${e.message}"
            )
        }
    }

    private suspend fun fetchFusedLocation(): Location? = suspendCancellableCoroutine { cont ->
        if (!hasLocationPermission()) {
            cont.resume(null)
            return@suspendCancellableCoroutine
        }

        val cts = CancellationTokenSource()
        cont.invokeOnCancellation { cts.cancel() }

        try {
            fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cts.token)
                .addOnSuccessListener { loc ->
                    if (loc != null) {
                        cont.resume(loc)
                    } else {
                        // Fallback to last known location if getCurrentLocation returned null
                        fusedClient.lastLocation.addOnSuccessListener { lastLoc ->
                            cont.resume(lastLoc)
                        }.addOnFailureListener {
                            cont.resume(null)
                        }
                    }
                }
                .addOnFailureListener {
                    // Try last location fallback
                    fusedClient.lastLocation.addOnSuccessListener { lastLoc ->
                        cont.resume(lastLoc)
                    }.addOnFailureListener {
                        cont.resume(null)
                    }
                }
        } catch (e: SecurityException) {
            cont.resume(null)
        }
    }
}
