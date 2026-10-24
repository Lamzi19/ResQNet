package org.resqnet.sos.ui.home

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.resqnet.sos.ResQNetSosApp
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.network.SosUploadWorker
import org.resqnet.sos.telemetry.HardwareStatus
import org.resqnet.sos.telemetry.NetworkStatus
import org.resqnet.sos.theme.*
import org.resqnet.sos.ui.components.SosStateBadge
import org.resqnet.sos.ui.components.StatusIndicatorCard

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToForm: () -> Unit,
    onNavigateToHistory: () -> Unit,
    onNavigateToSafetyCheck: () -> Unit,
    onRequestLocationPermission: () -> Unit,
    onRequestBluetoothPermission: () -> Unit = {}
) {
    val context = LocalContext.current
    val app = context.applicationContext as ResQNetSosApp
    val repository = app.repository
    val uploader = app.httpUploader
    val deviceStatusManager = app.deviceStatusManager
    val coroutineScope = rememberCoroutineScope()

    // Role selection: Citizen Mode vs Responder / Relay Station Mode
    var isResponderMode by remember { mutableStateOf(repository.isResponderMode()) }

    // Reactive counts from Room DB Flow
    val pendingCount by repository.getPendingCountFlow().collectAsState(initial = 0)
    val relayedBeacons by repository.getRelayedBeaconsFlow().collectAsState(initial = emptyList())
    val receivedPeerCount by repository.getReceivedPeerCountFlow().collectAsState(initial = 0)
    val confirmedCount by repository.getConfirmedCountFlow().collectAsState(initial = 0)

    // Periodic telemetry refresher
    var telemetry by remember { mutableStateOf(deviceStatusManager.getSnapshot()) }

    // Manual sync state
    var isSyncing by remember { mutableStateOf(false) }
    var syncFeedback by remember { mutableStateOf<String?>(null) }

    // Dialog states
    var showServerDialog by remember { mutableStateOf(false) }
    var showProfileDialog by remember { mutableStateOf(false) }

    var currentServerUrl by remember { mutableStateOf(uploader.getBaseUrl()) }
    var tempServerUrl by remember { mutableStateOf(currentServerUrl) }

    var participantId by remember { mutableStateOf(repository.getOrCreateParticipantId()) }
    var participantName by remember { mutableStateOf(repository.getParticipantName()) }
    var participantPhone by remember { mutableStateOf(repository.getParticipantPhone() ?: "") }
    var participantDistrict by remember { mutableStateOf(repository.getAssignedDistrict()) }

    var activeBroadcastTitle by remember { mutableStateOf<String?>(null) }
    var activeBroadcastDeadline by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        while (true) {
            telemetry = deviceStatusManager.getSnapshot()
            // Check for active safety broadcasts periodically if online
            if (telemetry.networkStatus == NetworkStatus.ONLINE) {
                try {
                    val active = uploader.fetchActiveBroadcast(participantId, null, participantDistrict)
                    if (active != null) {
                        activeBroadcastTitle = active.optString("title", "Safety Broadcast Active")
                        activeBroadcastDeadline = active.optString("expires_at", "")
                    } else {
                        activeBroadcastTitle = null
                    }
                } catch (e: Exception) {
                    // Ignore background poll errors
                }
            }
            delay(4000L) // Refresh every 4 seconds
        }
    }

    // Server Configuration Dialog
    if (showServerDialog) {
        AlertDialog(
            onDismissRequest = { showServerDialog = false },
            title = {
                Text("Central Gateway Server URL", color = ResQNetTextPrimary, fontWeight = FontWeight.Bold)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Default emulator: http://10.0.2.2:8000\nPhysical phone: http://<YOUR_PC_LAN_IP>:8000",
                        fontSize = 12.sp,
                        color = ResQNetTextSecondary
                    )
                    OutlinedTextField(
                        value = tempServerUrl,
                        onValueChange = { tempServerUrl = it },
                        label = { Text("Server Base URL") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        uploader.setBaseUrl(tempServerUrl)
                        currentServerUrl = uploader.getBaseUrl()
                        showServerDialog = false
                    }
                ) {
                    Text("Save", color = ResQNetBlue, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showServerDialog = false }) {
                    Text("Cancel", color = ResQNetTextMuted)
                }
            },
            containerColor = ResQNetSurface
        )
    }

    // Participant Profile Dialog
    if (showProfileDialog) {
        AlertDialog(
            onDismissRequest = { showProfileDialog = false },
            title = {
                Text("Handset Profile & Station Role", color = ResQNetTextPrimary, fontWeight = FontWeight.Bold)
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "Device ID: ${repository.getOrCreateDeviceId()}",
                        fontSize = 11.sp,
                        color = ResQNetBlue,
                        fontWeight = FontWeight.Bold
                    )
                    OutlinedTextField(
                        value = participantName,
                        onValueChange = { participantName = it },
                        label = { Text("Operator / Citizen Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = participantPhone,
                        onValueChange = { participantPhone = it },
                        label = { Text("Contact Phone") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = participantDistrict,
                        onValueChange = { participantDistrict = it },
                        label = { Text("District (e.g. ernakulam)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        repository.setParticipantProfile(null, participantName, participantPhone, participantDistrict)
                        coroutineScope.launch {
                            try {
                                uploader.registerParticipantWithServer(
                                    id = participantId,
                                    name = participantName,
                                    phoneNumber = participantPhone,
                                    districtId = participantDistrict,
                                    deviceId = repository.getOrCreateDeviceId(),
                                    latitude = null,
                                    longitude = null,
                                    accuracyM = null
                                )
                            } catch (e: Exception) {
                                // Ignore offline errors
                            }
                        }
                        showProfileDialog = false
                    }
                ) {
                    Text("Save Profile", color = ResQNetBlue, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { showProfileDialog = false }) {
                    Text("Cancel", color = ResQNetTextMuted)
                }
            },
            containerColor = ResQNetSurface
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(if (telemetry.networkStatus == NetworkStatus.ONLINE) ResQNetGreen else ResQNetOrange)
                        )
                        Column {
                            Text(
                                text = if (isResponderMode) "ResQNet Relay Station" else "ResQNet SOS",
                                fontSize = 17.sp,
                                fontWeight = FontWeight.Bold,
                                color = ResQNetTextPrimary
                            )
                            Text(
                                text = "NODE: ${repository.getOrCreateDeviceId()} | ${participantDistrict.uppercase()}",
                                fontSize = 10.sp,
                                color = ResQNetTextSecondary
                            )
                        }
                    }
                },
                actions = {
                    IconButton(onClick = { showProfileDialog = true }) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "Handset Profile",
                            tint = ResQNetTextPrimary
                        )
                    }
                    IconButton(onClick = { showServerDialog = true }) {
                        Icon(
                            imageVector = Icons.Default.Settings,
                            contentDescription = "Server Settings",
                            tint = ResQNetTextPrimary
                        )
                    }
                    IconButton(onClick = onNavigateToHistory) {
                        BadgedBox(
                            badge = {
                                if (pendingCount > 0) {
                                    Badge(
                                        containerColor = ResQNetOrange,
                                        contentColor = ResQNetTextPrimary
                                    ) {
                                        Text(pendingCount.toString())
                                    }
                                }
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Default.History,
                                contentDescription = "Distress History",
                                tint = ResQNetTextPrimary
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = ResQNetDarkBg
                )
            )
        },
        containerColor = ResQNetDarkBg
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            // Role Selection Segmented Switch
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(ResQNetSurface)
                    .border(1.dp, ResQNetBorder, RoundedCornerShape(10.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Citizen Mode Tab
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (!isResponderMode) ResQNetBlue else Color.Transparent)
                        .clickable {
                            isResponderMode = false
                            repository.setResponderMode(false)
                            app.bleRelayManager.stopMeshRelay()
                        }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = null,
                            tint = if (!isResponderMode) Color.White else ResQNetTextSecondary,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Citizen Mode",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (!isResponderMode) Color.White else ResQNetTextSecondary
                        )
                    }
                }

                // Responder / Relay Mode Tab
                Box(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isResponderMode) ResQNetGreen else Color.Transparent)
                        .clickable {
                            isResponderMode = true
                            repository.setResponderMode(true)
                            app.bleRelayManager.startMeshRelay()
                        }
                        .padding(vertical = 8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Sensors,
                            contentDescription = null,
                            tint = if (isResponderMode) Color.White else ResQNetTextSecondary,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Responder / Relay",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isResponderMode) Color.White else ResQNetTextSecondary
                        )
                    }
                }
            }

            LaunchedEffect(isResponderMode) {
                if (isResponderMode) {
                    app.bleRelayManager.startMeshRelay()
                } else {
                    app.bleRelayManager.stopMeshRelay()
                }
            }

            val isOnline = telemetry.networkStatus == NetworkStatus.ONLINE

            // BLE Active Broadcast Status Card
            if (app.bleRelayManager.isAdvertising) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0x3306B6D4)),
                    border = CardDefaults.outlinedCardBorder().copy(
                        brush = androidx.compose.ui.graphics.SolidColor(Color(0xFF06B6D4))
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Sensors,
                                contentDescription = null,
                                tint = Color(0xFF22D3EE),
                                modifier = Modifier.size(26.dp)
                            )
                            Column {
                                Text(
                                    text = "BLE DISTRESS BEACON ACTIVE",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFF22D3EE)
                                )
                                Text(
                                    text = "Transmitting offline distress beacon over Bluetooth LE to nearby laptop receiver.",
                                    fontSize = 11.sp,
                                    color = ResQNetTextPrimary
                                )
                            }
                        }
                        TextButton(
                            onClick = { app.bleRelayManager.stopAdvertisingBeacon() }
                        ) {
                            Text("Stop", color = ResQNetOrange, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            // -------------------------------------------------------------
            // A. RESPONDER / RELAY STATION MODE UI
            // -------------------------------------------------------------
            if (isResponderMode) {
                // Relay Status Banner
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0x1F22C55E)),
                    border = CardDefaults.outlinedCardBorder().copy(
                        brush = androidx.compose.ui.graphics.SolidColor(ResQNetGreen)
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Sensors,
                            contentDescription = null,
                            tint = ResQNetGreen,
                            modifier = Modifier.size(24.dp)
                        )
                        Column {
                            Text(
                                text = if (app.bleRelayManager.isMeshRelayActive) "AUTONOMOUS MESH RELAY ACTIVE" else "RELAY STATION STANDBY",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = ResQNetGreen
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "Time-division duty-cycling between peer scan (4s) and forward broadcast (5s). Multi-hop store-and-forward relaying offline distress beacons across handsets until reaching laptop gateway.",
                                fontSize = 12.sp,
                                color = ResQNetTextPrimary,
                                lineHeight = 17.sp
                            )
                        }
                    }
                }

                // 3-Metric KPI Grid
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Peer Beacons
                    Card(
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
                        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
                    ) {
                        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(text = receivedPeerCount.toString(), fontSize = 20.sp, fontWeight = FontWeight.Black, color = ResQNetBlue)
                            Text(text = "Peer Beacons", fontSize = 10.sp, color = ResQNetTextSecondary, textAlign = TextAlign.Center)
                        }
                    }

                    // Forwarded / Confirmed
                    Card(
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
                        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
                    ) {
                        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(text = confirmedCount.toString(), fontSize = 20.sp, fontWeight = FontWeight.Black, color = ResQNetGreen)
                            Text(text = "Confirmed Ack", fontSize = 10.sp, color = ResQNetTextSecondary, textAlign = TextAlign.Center)
                        }
                    }

                    // Pending Uplink
                    Card(
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
                        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
                    ) {
                        Column(modifier = Modifier.padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(text = pendingCount.toString(), fontSize = 20.sp, fontWeight = FontWeight.Black, color = if (pendingCount > 0) ResQNetOrange else ResQNetTextMuted)
                            Text(text = "Pending Uplink", fontSize = 10.sp, color = ResQNetTextSecondary, textAlign = TextAlign.Center)
                        }
                    }
                }

                // Manual Gateway Sync Button
                Button(
                    onClick = {
                        coroutineScope.launch {
                            isSyncing = true
                            try {
                                val uploaded = uploader.uploadPendingBeacons()
                                val confirmed = uploader.syncDeliveryAcknowledgements()
                                syncFeedback = "Gateway sync: $uploaded uploaded, $confirmed confirmed."
                            } catch (e: Exception) {
                                syncFeedback = "Sync failed: ${e.message}"
                            } finally {
                                isSyncing = false
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ResQNetGreen,
                        contentColor = Color.White
                    ),
                    enabled = !isSyncing
                ) {
                    Icon(
                        imageVector = Icons.Default.Sync,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isSyncing) "Syncing with Gateway..." else "Sync Relay with Gateway",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }

                if (syncFeedback != null) {
                    Text(
                        text = syncFeedback!!,
                        fontSize = 11.sp,
                        color = ResQNetGreen,
                        fontWeight = FontWeight.SemiBold
                    )
                }

                // Relayed Beacons Log
                Text(
                    text = "HEARD PEER DISTRESS BEACONS (${relayedBeacons.size})",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = ResQNetTextSecondary,
                    letterSpacing = 1.sp,
                    modifier = Modifier.fillMaxWidth()
                )

                if (relayedBeacons.isEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
                        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(24.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(imageVector = Icons.Default.SensorsOff, contentDescription = null, tint = ResQNetTextMuted, modifier = Modifier.size(32.dp))
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(text = "No peer beacons heard yet.", fontSize = 12.sp, fontWeight = FontWeight.Bold, color = ResQNetTextSecondary)
                            Text(text = "Nearby citizen handsets transmitting offline distress beacons will appear here.", fontSize = 11.sp, color = ResQNetTextMuted, textAlign = TextAlign.Center)
                        }
                    }
                } else {
                    relayedBeacons.take(5).forEach { b ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp),
                            colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
                            border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
                        ) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = "Node ${b.originDeviceId.take(10)}...",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = ResQNetBlue
                                    )
                                    SosStateBadge(state = b.deliveryState)
                                }
                                Text(
                                    text = b.messageText,
                                    fontSize = 12.sp,
                                    color = ResQNetTextPrimary,
                                    maxLines = 2
                                )
                                Text(
                                    text = "👥 ${b.peopleCount} stranded · Hops: ${b.hopCount} · ${if (b.hasValidLocation) "GPS Fixed" else "No GPS"}",
                                    fontSize = 10.sp,
                                    color = ResQNetTextSecondary
                                )
                            }
                        }
                    }
                }

            } else {
                // -------------------------------------------------------------
                // B. CITIZEN HANDSET MODE UI
                // -------------------------------------------------------------

                // Network Mode Banner
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isOnline) Color(0x1F22C55E) else Color(0x1FF97316)
                    ),
                    border = CardDefaults.outlinedCardBorder().copy(
                        brush = androidx.compose.ui.graphics.SolidColor(
                            if (isOnline) ResQNetGreen else ResQNetOrange
                        )
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = if (isOnline) Icons.Default.CloudDone else Icons.Default.CloudOff,
                            contentDescription = null,
                            tint = if (isOnline) ResQNetGreen else ResQNetOrange,
                            modifier = Modifier.size(22.dp)
                        )
                        Column {
                            Text(
                                text = if (isOnline) "ONLINE DIRECT MODE" else "OFFLINE STORE-AND-FORWARD MODE",
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                color = if (isOnline) ResQNetGreen else ResQNetOrange
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = if (isOnline) {
                                    "Direct internet connectivity is active. SOS beacons will be uploaded to ResQNet servers and confirmed in your local Room history."
                                } else {
                                    "No cellular/Wi-Fi connection. SOS beacons will be stored locally in SQLite Room storage and queued for nearby responder relay."
                                },
                                fontSize = 12.sp,
                                color = ResQNetTextPrimary,
                                lineHeight = 17.sp
                            )
                        }
                    }
                }

                // Safety Broadcast Active Alert Banner
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onNavigateToSafetyCheck() },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (activeBroadcastTitle != null) Color(0x333B82F6) else ResQNetSurface
                    ),
                    border = CardDefaults.outlinedCardBorder().copy(
                        brush = androidx.compose.ui.graphics.SolidColor(
                            if (activeBroadcastTitle != null) ResQNetBlue else ResQNetBorder
                        )
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Campaign,
                                contentDescription = null,
                                tint = if (activeBroadcastTitle != null) ResQNetBlue else ResQNetTextSecondary,
                                modifier = Modifier.size(26.dp)
                            )
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(
                                        text = if (activeBroadcastTitle != null) "SAFETY CHECK BROADCAST ACTIVE" else "Safety Check-In",
                                        fontSize = 13.sp,
                                        fontWeight = FontWeight.Bold,
                                        color = if (activeBroadcastTitle != null) ResQNetBlue else ResQNetTextPrimary
                                    )
                                    if (activeBroadcastTitle != null) {
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(4.dp))
                                                .background(ResQNetRed)
                                                .padding(horizontal = 4.dp, vertical = 2.dp)
                                        ) {
                                            Text("ACTION REQUIRED", fontSize = 9.sp, fontWeight = FontWeight.Black, color = Color.White)
                                        }
                                    }
                                }
                                Text(
                                    text = activeBroadcastTitle ?: "Check for district safety broadcasts and confirm your status.",
                                    fontSize = 11.sp,
                                    color = ResQNetTextSecondary,
                                    maxLines = 1
                                )
                            }
                        }

                        Button(
                            onClick = onNavigateToSafetyCheck,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (activeBroadcastTitle != null) ResQNetBlue else Color(0x223B82F6),
                                contentColor = if (activeBroadcastTitle != null) Color.White else ResQNetBlue
                            ),
                            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text(if (activeBroadcastTitle != null) "Respond" else "View", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // Large Emergency Panic Button
                Spacer(modifier = Modifier.height(8.dp))
                Box(
                    modifier = Modifier
                        .size(200.dp)
                        .clip(CircleShape)
                        .background(ResQNetRedGlow)
                        .border(2.dp, ResQNetRed.copy(alpha = 0.5f), CircleShape)
                        .padding(14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(CircleShape)
                            .background(ResQNetRed)
                            .clickable { onNavigateToForm() },
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Warning,
                                contentDescription = "Emergency Panic Button",
                                tint = Color.White,
                                modifier = Modifier.size(46.dp)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = "EMERGENCY",
                                color = Color.White,
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 1.sp
                            )
                            Text(
                                text = "SOS",
                                color = Color.White,
                                fontSize = 24.sp,
                                fontWeight = FontWeight.Black
                            )
                            Text(
                                text = "TAP TO REPORT",
                                color = Color.White.copy(alpha = 0.85f),
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
                Spacer(modifier = Modifier.height(8.dp))

                // Hardware & Telemetry Status Cards
                Text(
                    text = "COMMUNICATION & LOCATION STATUS",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = ResQNetTextSecondary,
                    letterSpacing = 1.sp,
                    modifier = Modifier.fillMaxWidth()
                )

                // Bluetooth Status
                val btStatus = telemetry.bluetoothStatus
                val (btText, btColor) = when (btStatus) {
                    HardwareStatus.ENABLED -> "Bluetooth Active (Ready for Mesh)" to ResQNetGreen
                    HardwareStatus.DISABLED -> "Bluetooth Disabled (Tap to enable)" to ResQNetOrange
                    HardwareStatus.PERMISSION_REQUIRED -> "Bluetooth Permission Required" to ResQNetYellow
                    HardwareStatus.UNSUPPORTED -> "Bluetooth Not Supported on this Device" to ResQNetTextMuted
                }
                StatusIndicatorCard(
                    title = "Bluetooth Radio",
                    statusText = btText,
                    icon = Icons.Default.Bluetooth,
                    statusColor = btColor,
                    actionLabel = when (btStatus) {
                        HardwareStatus.PERMISSION_REQUIRED -> "Grant"
                        HardwareStatus.DISABLED -> "Turn On"
                        else -> null
                    },
                    onActionClick = when (btStatus) {
                        HardwareStatus.PERMISSION_REQUIRED -> onRequestBluetoothPermission
                        HardwareStatus.DISABLED -> {
                            { context.startActivity(deviceStatusManager.createOpenBluetoothSettingsIntent()) }
                        }
                        else -> null
                    }
                )

                // GPS Location Status
                val locStatus = telemetry.locationStatus
                val (locText, locColor) = when (locStatus) {
                    HardwareStatus.ENABLED -> "GPS Hardware Ready & Active" to ResQNetGreen
                    HardwareStatus.DISABLED -> "Location Service Turned Off" to ResQNetOrange
                    HardwareStatus.PERMISSION_REQUIRED -> "Permission Needed for Accurate Fix" to ResQNetYellow
                    HardwareStatus.UNSUPPORTED -> "Location Hardware Unavailable" to ResQNetTextMuted
                }
                StatusIndicatorCard(
                    title = "GPS Satellite Location",
                    statusText = locText,
                    icon = Icons.Default.LocationOn,
                    statusColor = locColor,
                    actionLabel = when (locStatus) {
                        HardwareStatus.PERMISSION_REQUIRED -> "Grant"
                        HardwareStatus.DISABLED -> "Enable GPS"
                        else -> null
                    },
                    onActionClick = when (locStatus) {
                        HardwareStatus.PERMISSION_REQUIRED -> onRequestLocationPermission
                        HardwareStatus.DISABLED -> {
                            { context.startActivity(deviceStatusManager.createOpenLocationSettingsIntent()) }
                        }
                        else -> null
                    }
                )

                // Internet Status
                StatusIndicatorCard(
                    title = "Cellular / Wi-Fi Gateway",
                    statusText = if (isOnline) "Connected to Central Gateway" else "Disconnected (Offline Mode)",
                    icon = if (isOnline) Icons.Default.Wifi else Icons.Default.WifiOff,
                    statusColor = if (isOnline) ResQNetGreen else ResQNetOrange
                )

                // Pending Queue Summary Card
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onNavigateToHistory() },
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
                    border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Outbox,
                                contentDescription = null,
                                tint = if (pendingCount > 0) ResQNetOrange else ResQNetTextSecondary
                            )
                            Column {
                                Text(
                                    text = "Pending Outbound SOS Queue",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = ResQNetTextPrimary
                                )
                                Text(
                                    text = if (pendingCount == 0) {
                                        "No unsent distress signals."
                                    } else {
                                        "$pendingCount beacon(s) saved locally awaiting peer relay."
                                    },
                                    fontSize = 11.sp,
                                    color = ResQNetTextSecondary
                                )
                            }
                        }

                        if (pendingCount > 0 && isOnline) {
                            Button(
                                onClick = {
                                    coroutineScope.launch {
                                        isSyncing = true
                                        try {
                                            uploader.uploadPendingBeacons()
                                            uploader.syncDeliveryAcknowledgements()
                                        } finally {
                                            isSyncing = false
                                        }
                                    }
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = ResQNetOrange,
                                    contentColor = Color.White
                                ),
                                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                shape = RoundedCornerShape(6.dp)
                            ) {
                                Text("Sync Now", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        } else {
                            Icon(
                                imageVector = Icons.Default.ChevronRight,
                                contentDescription = "Go to History",
                                tint = ResQNetTextMuted
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
        }
    }
}
