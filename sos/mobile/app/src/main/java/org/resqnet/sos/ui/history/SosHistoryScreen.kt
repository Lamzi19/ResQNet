package org.resqnet.sos.ui.history

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.resqnet.sos.ResQNetSosApp
import org.resqnet.sos.data.model.SosEntity
import org.resqnet.sos.data.model.SosSeverity
import org.resqnet.sos.theme.*
import org.resqnet.sos.ui.components.SosStateBadge
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SosHistoryScreen(
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val app = context.applicationContext as ResQNetSosApp
    val repository = app.repository

    val messages by repository.getAllSosFlow().collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var isSyncing by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "SOS Beacon History",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = ResQNetTextPrimary
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back",
                            tint = ResQNetTextPrimary
                        )
                    }
                },
                actions = {
                    IconButton(
                        onClick = {
                            if (!isSyncing) {
                                isSyncing = true
                                scope.launch {
                                    val synced = app.httpUploader.uploadPendingBeacons()
                                    isSyncing = false
                                    val msg = if (synced > 0) {
                                        "Successfully synced $synced pending beacons"
                                    } else {
                                        "Sync checked: no pending beacons or gateway offline"
                                    }
                                    android.widget.Toast.makeText(context, msg, android.widget.Toast.LENGTH_SHORT).show()
                                }
                            }
                        }
                    ) {
                        if (isSyncing) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = ResQNetCyan,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Icon(
                                imageVector = Icons.Default.Sync,
                                contentDescription = "Retry Gateway Upload",
                                tint = ResQNetCyan
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ResQNetDarkBg)
            )
        },
        containerColor = ResQNetDarkBg
    ) { paddingValues ->
        if (messages.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Inbox,
                        contentDescription = null,
                        tint = ResQNetTextMuted,
                        modifier = Modifier.size(54.dp)
                    )
                    Text(
                        text = "No Distress Signals Recorded",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = ResQNetTextSecondary
                    )
                    Text(
                        text = "Emergency beacons created from the home screen will appear here.",
                        fontSize = 12.sp,
                        color = ResQNetTextMuted
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                item {
                    // Delivery Truth Protocol Banner
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
                        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.Top,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                tint = ResQNetCyan,
                                modifier = Modifier.size(18.dp)
                            )
                            Column {
                                Text(
                                    text = "DELIVERY STATUS INTEGRITY",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ResQNetCyan,
                                    letterSpacing = 0.5.sp
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "ResQNet never labels a message 'Delivered' simply because it was queued or advertised. A beacon is only confirmed Delivered when verified by incident command servers or rescuer acknowledgement.",
                                    fontSize = 11.sp,
                                    color = ResQNetTextSecondary,
                                    lineHeight = 15.sp
                                )
                            }
                        }
                    }
                }

                items(messages, key = { it.messageId }) { sos ->
                    SosMessageCard(sos = sos)
                }

                item {
                    Spacer(modifier = Modifier.height(16.dp))
                }
            }
        }
    }
}

@Composable
fun SosMessageCard(sos: SosEntity) {
    val timeFormat = remember { SimpleDateFormat("dd MMM, HH:mm:ss", Locale.getDefault()) }
    val formattedDate = remember(sos.createdAt) { timeFormat.format(Date(sos.createdAt)) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
        border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            // Header: State badge + Severity
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                SosStateBadge(state = sos.deliveryState)

                Text(
                    text = sos.severity.name,
                    color = when (sos.severity) {
                        SosSeverity.CRITICAL -> ResQNetRed
                        SosSeverity.HIGH -> ResQNetOrange
                        SosSeverity.MODERATE -> ResQNetYellow
                        SosSeverity.LOW -> ResQNetGreen
                    },
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            }

            // Message text
            Text(
                text = sos.messageText,
                color = ResQNetTextPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                lineHeight = 20.sp
            )

            // Honest Status Explanation
            Text(
                text = sos.deliveryState.detailedStatus,
                color = ResQNetCyan,
                fontSize = 11.sp,
                lineHeight = 15.sp
            )

            Divider(color = ResQNetBorder.copy(alpha = 0.5f), thickness = 0.5.dp)

            // Telemetry & Details Row
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                // Location row
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.LocationOn,
                        contentDescription = null,
                        tint = if (sos.hasValidLocation) ResQNetGreen else ResQNetTextMuted,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = if (sos.hasValidLocation) {
                            "%.5f, %.5f (±%.1fm)".format(sos.latitude, sos.longitude, sos.locationAccuracyM ?: 0f)
                        } else {
                            "No GPS fix available"
                        },
                        fontSize = 11.sp,
                        color = if (sos.hasValidLocation) ResQNetTextPrimary else ResQNetTextMuted
                    )
                }

                // People row
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Groups,
                        contentDescription = null,
                        tint = ResQNetTextSecondary,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "${sos.peopleCount} Person(s)  " + if (sos.hasVulnerablePeople) "• Vulnerable / Children Present" else "",
                        fontSize = 11.sp,
                        color = ResQNetTextSecondary
                    )
                }

                // Metadata row (Timestamp, Hops, Incident UUID)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    val hopBadge = when (sos.hopCount) {
                        0 -> "Hop 0: Origin Handset"
                        1 -> "Hop 1: Relayed Peer"
                        else -> "Hop ${sos.hopCount}: Multi-Hop Mesh"
                    }
                    Text(
                        text = "$hopBadge • ${sos.deliveryChannel ?: "BLE"}",
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (sos.hopCount > 0) ResQNetCyan else ResQNetGreen
                    )
                    Text(
                        text = "ID: ${sos.messageId.take(12)}",
                        fontSize = 10.sp,
                        color = ResQNetTextMuted
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Logged: $formattedDate",
                        fontSize = 10.sp,
                        color = ResQNetTextMuted
                    )
                    if (sos.relayNodeId != null) {
                        Text(
                            text = "Relay: ${sos.relayNodeId}",
                            fontSize = 10.sp,
                            color = ResQNetTextSecondary
                        )
                    }
                }
            }
        }
    }
}
