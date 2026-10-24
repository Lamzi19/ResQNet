package org.resqnet.sos.telemetry

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.provider.Settings
import org.resqnet.sos.location.LocationHelper

enum class HardwareStatus {
    ENABLED,
    DISABLED,
    PERMISSION_REQUIRED,
    UNSUPPORTED
}

enum class NetworkStatus {
    ONLINE,
    OFFLINE
}

data class DeviceTelemetrySnapshot(
    val bluetoothStatus: HardwareStatus,
    val locationStatus: HardwareStatus,
    val networkStatus: NetworkStatus
)

class DeviceStatusManager(
    private val context: Context,
    private val locationHelper: LocationHelper
) {
    private val connectivityManager by lazy {
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
    }

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        val bm = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        bm?.adapter
    }

    fun getSnapshot(): DeviceTelemetrySnapshot {
        return DeviceTelemetrySnapshot(
            bluetoothStatus = checkBluetoothStatus(),
            locationStatus = checkLocationStatus(),
            networkStatus = checkNetworkStatus()
        )
    }

    fun checkBluetoothStatus(): HardwareStatus {
        val adapter = bluetoothAdapter ?: return HardwareStatus.UNSUPPORTED
        if (!adapter.isEnabled) {
            return HardwareStatus.DISABLED
        }

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            val hasAdvertise = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.BLUETOOTH_ADVERTISE
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            val hasConnect = androidx.core.content.ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.BLUETOOTH_CONNECT
            ) == android.content.pm.PackageManager.PERMISSION_GRANTED

            if (!hasAdvertise || !hasConnect) {
                return HardwareStatus.PERMISSION_REQUIRED
            }
        }

        return HardwareStatus.ENABLED
    }

    fun checkLocationStatus(): HardwareStatus {
        if (!locationHelper.hasLocationPermission()) {
            return HardwareStatus.PERMISSION_REQUIRED
        }
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return HardwareStatus.UNSUPPORTED

        val isGpsOn = lm.isProviderEnabled(LocationManager.GPS_PROVIDER)
        val isNetworkOn = lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)

        return if (isGpsOn || isNetworkOn) {
            HardwareStatus.ENABLED
        } else {
            HardwareStatus.DISABLED
        }
    }

    fun checkNetworkStatus(): NetworkStatus {
        val cm = connectivityManager ?: return NetworkStatus.OFFLINE
        val activeNetwork = cm.activeNetwork ?: return NetworkStatus.OFFLINE
        val caps = cm.getNetworkCapabilities(activeNetwork) ?: return NetworkStatus.OFFLINE

        val hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)

        return if (hasInternet) NetworkStatus.ONLINE else NetworkStatus.OFFLINE
    }

    /**
     * Intent to open the Android Bluetooth settings screen.
     * Modern Android security mandates that user explicitly enables hardware.
     */
    fun createOpenBluetoothSettingsIntent(): Intent {
        return Intent(Settings.ACTION_BLUETOOTH_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
    }

    /**
     * Intent to open the Android Location source settings screen.
     */
    fun createOpenLocationSettingsIntent(): Intent {
        return Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
    }
}
