package org.resqnet.sos.ui.safety

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.resqnet.sos.ResQNetSosApp
import org.resqnet.sos.data.model.SosDeliveryState
import org.resqnet.sos.data.model.SosSeverity
import org.resqnet.sos.location.LocationState
import org.resqnet.sos.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SafetyCheckScreen(
    onNavigateBack: () -> Unit,
    onNavigateToHistory: () -> Unit
) {
    val context = LocalContext.current
    val app = context.applicationContext as ResQNetSosApp
    val repository = app.repository
    val uploader = app.httpUploader
    val locationHelper = app.locationHelper
    val scope = rememberCoroutineScope()

    val participantId = remember { repository.getOrCreateParticipantId() }
    val deviceId = remember { repository.getOrCreateDeviceId() }
    val participantName = remember { repository.getParticipantName() }
    val districtId = remember { repository.getAssignedDistrict() }

    var activeBroadcast by remember { mutableStateOf<JSONObject?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var isResponding by remember { mutableStateOf(false) }
    var responseState by remember { mutableStateOf<String?>("AWAITING RESPONSE") }
    var locationState by remember { mutableStateOf<LocationState>(LocationState.Acquiring) }
    var countdownSeconds by remember { mutableIntStateOf(0) }
    var userNote by remember { mutableStateOf("") }
    var peopleCount by remember { mutableIntStateOf(1) }
    var hasVulnerable by remember { mutableStateOf(false) }

    // Fetch initial location fix
    LaunchedEffect(Unit) {
        locationState = locationHelper.captureCurrentLocation()
    }

    // Poll for active broadcast
    suspend fun refreshBroadcast() {
        val bc = uploader.fetchActiveBroadcast(participantId, deviceId, districtId)
        activeBroadcast = bc
        isLoading = false
        if (bc != null) {
            val remSecs = bc.optInt("seconds_remaining", bc.optInt("deadline_seconds", 60))
            countdownSeconds = remSecs
            val recipients = bc.optJSONArray("recipients")
            if (recipients != null) {
                for (i in 0 until recipients.length()) {
                    val r = recipients.optJSONObject(i)
                    if (r?.optString("participant_id") == participantId) {
                        responseState = r.optString("safety_status", "AWAITING RESPONSE")
                        break
                    }
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        refreshBroadcast()
    }

    // Local countdown timer
    LaunchedEffect(countdownSeconds) {
        if (countdownSeconds > 0) {
            delay(1000L)
            countdownSeconds -= 1
            if (countdownSeconds == 0 && responseState == "AWAITING RESPONSE") {
                responseState = "NO RESPONSE — VERIFY SAFETY"
            }
        }
    }

    // Handle I AM SAFE submission
    fun handleSafeSubmit() {
        val bc = activeBroadcast ?: return
        val bcId = bc.optString("id")
        if (bcId.isNullOrBlank()) return

        isResponding = true
        scope.launch {
            val loc = (locationState as? LocationState.Success)?.snapshot
            val res = uploader.submitSafetyResponse(
                broadcastId = bcId,
                participantId = participantId,
                deviceId = deviceId,
                safetyStatus = "SAFE CONFIRMED",
                note = userNote.trim().ifEmpty { "Citizen confirmed safe." },
                latitude = loc?.latitude,
                longitude = loc?.longitude,
                accuracyM = loc?.accuracyM
            )

            isResponding = false
            if (res != null) {
                responseState = "SAFE CONFIRMED"
                Toast.makeText(context, "Safety Confirmation Accepted by Command!", Toast.LENGTH_LONG).show()
                refreshBroadcast()
            } else {
                Toast.makeText(context, "Network offline. Submission queued for retry.", Toast.LENGTH_LONG).show()
            }
        }
    }

    // Handle I NEED HELP submission
    fun handleHelpSubmit() {
        val bc = activeBroadcast ?: return
        val bcId = bc.optString("id")
        if (bcId.isNullOrBlank()) return

        isResponding = true
        scope.launch {
            val loc = (locationState as? LocationState.Success)?.snapshot
            val distressMsg = userNote.trim().ifEmpty {
                "URGENT: Floodwater distress reported via Safety Broadcast #${bcId.takeLast(6)}."
            }

            // Step 1: Save SOS locally in Room persistence
            val savedSos = repository.createAndSaveSos(
                messageText = distressMsg,
                peopleCount = peopleCount,
                hasVulnerablePeople = hasVulnerable,
                severity = SosSeverity.CRITICAL,
                latitude = loc?.latitude,
                longitude = loc?.longitude,
                accuracyM = loc?.accuracyM,
                locationTimestamp = loc?.timestamp,
                districtId = districtId,
                broadcastId = bcId,
                participantId = participantId,
                deliveryChannel = "INTERNET"
            )

            // Step 2: Opportunistic HTTP upload
            val uploaded = uploader.uploadSingleBeacon(savedSos)
            if (uploaded) {
                repository.updateDeliveryState(savedSos.messageId, SosDeliveryState.ACKNOWLEDGED_BY_SERVER)
            }

            // Step 3: Link response to broadcast
            val res = uploader.submitSafetyResponse(
                broadcastId = bcId,
                participantId = participantId,
                deviceId = deviceId,
                safetyStatus = "HELP REQUESTED",
                note = distressMsg,
                latitude = loc?.latitude,
                longitude = loc?.longitude,
                accuracyM = loc?.accuracyM,
                peopleCount = peopleCount,
                hasVulnerable = hasVulnerable
            )

            isResponding = false
            responseState = "HELP REQUESTED"
            Toast.makeText(context, "Emergency SOS Created & Linked to Command!", Toast.LENGTH_LONG).show()
            refreshBroadcast()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Disaster Safety Check",
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
                    IconButton(onClick = { scope.launch { refreshBroadcast() } }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Check for Updates",
                            tint = ResQNetCyan
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = ResQNetDarkBg)
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
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {

            // 1. Participant Identity Badge Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = ResQNetCardBg),
                border = androidx.compose.foundation.BorderStroke(1.dp, ResQNetCardBorder)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text(
                            text = "REGISTERED PARTICIPANT",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = ResQNetCyan,
                            letterSpacing = 0.5.sp
                        )
                        Text(
                            text = participantName,
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            color = ResQNetTextPrimary
                        )
                        Text(
                            text = "ID: $participantId · District: ${districtId.uppercase()}",
                            fontSize = 11.sp,
                            color = ResQNetTextSecondary
                        )
                    }
                    Box(
                        modifier = Modifier
                            .background(ResQNetDarkSurface, RoundedCornerShape(6.dp))
                            .border(1.dp, ResQNetCardBorder, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "STATUS: ONLINE",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = ResQNetGreen
                        )
                    }
                }
            }

            // 2. Active Broadcast Card or Empty State
            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(40.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = ResQNetCyan)
                }
            } else if (activeBroadcast != null) {
                val bc = activeBroadcast!!
                val title = bc.optString("title", "Safety Verification Alert")
                val msg = bc.optString("message", "Please confirm if you are safe.")
                val severity = bc.optString("severity", "WARNING")

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = ResQNetCardBg),
                    border = androidx.compose.foundation.BorderStroke(
                        1.5.dp,
                        if (severity == "CRITICAL") ResQNetRed else ResQNetOrange
                    )
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "🚨 ACTIVE SAFETY BROADCAST",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (severity == "CRITICAL") ResQNetRed else ResQNetOrange
                            )

                            // Countdown clock
                            if (countdownSeconds > 0) {
                                Box(
                                    modifier = Modifier
                                        .background(
                                            if (countdownSeconds <= 15) Color(0xFF451115) else ResQNetDarkSurface,
                                            RoundedCornerShape(6.dp)
                                        )
                                        .border(1.dp, if (countdownSeconds <= 15) ResQNetRed else ResQNetCyan, RoundedCornerShape(6.dp))
                                        .padding(horizontal = 8.dp, vertical = 3.dp)
                                ) {
                                    Text(
                                        text = "⏱️ ${countdownSeconds}s LEFT",
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.ExtraBold,
                                        color = if (countdownSeconds <= 15) ResQNetRed else ResQNetCyan
                                    )
                                }
                            } else {
                                Text(
                                    text = "EXPIRED",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFF472B6)
                                )
                            }
                        }

                        Text(
                            text = title,
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            color = ResQNetTextPrimary
                        )

                        Text(
                            text = msg,
                            fontSize = 13.sp,
                            color = ResQNetTextSecondary,
                            lineHeight = 18.sp
                        )

                        // Current Response Status Badge
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "Your Current State:",
                                fontSize = 12.sp,
                                color = ResQNetTextSecondary
                            )

                            val badgeColor = when (responseState) {
                                "SAFE CONFIRMED" -> ResQNetGreen
                                "HELP REQUESTED" -> ResQNetRed
                                "NO RESPONSE — VERIFY SAFETY" -> Color(0xFFF472B6)
                                else -> ResQNetOrange
                            }

                            Box(
                                modifier = Modifier
                                    .background(badgeColor.copy(alpha = 0.15f), RoundedCornerShape(6.dp))
                                    .border(1.dp, badgeColor, RoundedCornerShape(6.dp))
                                    .padding(horizontal = 10.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = responseState ?: "AWAITING RESPONSE",
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = badgeColor
                                )
                            }
                        }
                    }
                }

                // 3. Optional Citizen Response Note & Details
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ResQNetCardBg),
                    border = androidx.compose.foundation.BorderStroke(1.dp, ResQNetCardBorder)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Text(
                            text = "SITUATION NOTE (OPTIONAL)",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = ResQNetCyan
                        )
                        OutlinedTextField(
                            value = userNote,
                            onValueChange = { userNote = it },
                            placeholder = { Text("e.g. 2nd floor, water rising, power cut...", fontSize = 12.sp, color = ResQNetTextMuted) },
                            modifier = Modifier.fillMaxWidth(),
                            maxLines = 2,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = ResQNetCyan,
                                unfocusedBorderColor = ResQNetCardBorder,
                                focusedTextColor = ResQNetTextPrimary,
                                unfocusedTextColor = ResQNetTextPrimary
                            )
                        )

                        // People Count Selector (if help needed)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "People at location: $peopleCount",
                                fontSize = 12.sp,
                                color = ResQNetTextPrimary
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Button(
                                    onClick = { if (peopleCount > 1) peopleCount-- },
                                    modifier = Modifier.size(32.dp),
                                    contentPadding = PaddingValues(0.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = ResQNetDarkSurface)
                                ) {
                                    Text("-", color = ResQNetTextPrimary)
                                }
                                Button(
                                    onClick = { peopleCount++ },
                                    modifier = Modifier.size(32.dp),
                                    contentPadding = PaddingValues(0.dp),
                                    colors = ButtonDefaults.buttonColors(containerColor = ResQNetDarkSurface)
                                ) {
                                    Text("+", color = ResQNetTextPrimary)
                                }
                            }
                        }

                        // Vulnerable flag
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "Vulnerable (elderly/child/pregnant)",
                                fontSize = 12.sp,
                                color = ResQNetTextPrimary
                            )
                            Switch(
                                checked = hasVulnerable,
                                onCheckedChange = { hasVulnerable = it },
                                colors = SwitchDefaults.colors(checkedThumbColor = ResQNetRed)
                            )
                        }
                    }
                }

                // 4. Two Big Response Buttons
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // I AM SAFE BUTTON
                    Button(
                        onClick = { handleSafeSubmit() },
                        enabled = !isResponding,
                        modifier = Modifier
                            .weight(1f)
                            .height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = ResQNetGreen)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color.White)
                            Text(
                                text = "I AM SAFE",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }

                    // I NEED HELP BUTTON
                    Button(
                        onClick = { handleHelpSubmit() },
                        enabled = !isResponding,
                        modifier = Modifier
                            .weight(1f)
                            .height(56.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = ResQNetRed)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.Default.Warning, contentDescription = null, tint = Color.White)
                            Text(
                                text = "I NEED HELP",
                                fontSize = 14.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }
                }
            } else {
                // No active broadcast for this participant
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ResQNetCardBg),
                    border = androidx.compose.foundation.BorderStroke(1.dp, ResQNetCardBorder)
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CheckCircle,
                            contentDescription = null,
                            tint = ResQNetGreen,
                            modifier = Modifier.size(48.dp)
                        )
                        Text(
                            text = "No Active Broadcasts",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = ResQNetTextPrimary
                        )
                        Text(
                            text = "There are no pending safety checks targeting your district at this moment.",
                            fontSize = 12.sp,
                            color = ResQNetTextSecondary,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }

            // 5. GPS Location State Footer
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = ResQNetDarkSurface),
                border = androidx.compose.foundation.BorderStroke(1.dp, ResQNetCardBorder)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.LocationOn,
                        contentDescription = null,
                        tint = if (locationState is LocationState.Success) ResQNetGreen else ResQNetOrange,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = when (val s = locationState) {
                            is LocationState.Success -> "GPS Location: ${String.format("%.4f", s.snapshot.latitude)}, ${String.format("%.4f", s.snapshot.longitude)} (±${s.snapshot.accuracyM.toInt()}m)"
                            is LocationState.Acquiring -> "Acquiring GPS fix..."
                            is LocationState.Error -> "Location: ${s.reason.name} (LOCATION UNAVAILABLE)"
                            else -> "LOCATION UNAVAILABLE"
                        },
                        fontSize = 11.sp,
                        color = ResQNetTextSecondary
                    )
                }
            }
        }
    }
}
