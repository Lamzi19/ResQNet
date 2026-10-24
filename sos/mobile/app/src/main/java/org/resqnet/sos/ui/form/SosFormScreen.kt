package org.resqnet.sos.ui.form

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import org.resqnet.sos.ResQNetSosApp
import org.resqnet.sos.data.model.SosSeverity
import org.resqnet.sos.location.LocationErrorReason
import org.resqnet.sos.location.LocationState
import org.resqnet.sos.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SosFormScreen(
    onNavigateBack: () -> Unit,
    onSosSubmitted: () -> Unit,
    onRequestLocationPermission: () -> Unit
) {
    val context = LocalContext.current
    val app = context.applicationContext as ResQNetSosApp
    val repository = app.repository
    val locationHelper = app.locationHelper
    val scope = rememberCoroutineScope()

    // Form inputs with fast-reporting defaults
    var messageText by remember {
        mutableStateOf("I am trapped by rising floodwater. Immediate assistance required.")
    }
    var peopleCount by remember { mutableIntStateOf(1) }
    var hasVulnerablePeople by remember { mutableStateOf(false) }
    var selectedSeverity by remember { mutableStateOf(SosSeverity.CRITICAL) }
    var additionalNotes by remember { mutableStateOf("") }

    // Location state
    var locationState by remember { mutableStateOf<LocationState>(LocationState.Acquiring) }
    var isSubmitting by remember { mutableStateOf(false) }

    // Fetch GPS fix on entry
    LaunchedEffect(Unit) {
        locationState = locationHelper.captureCurrentLocation()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Report Emergency Distress",
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

            // 1. GPS Location Capture Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = ResQNetSurface),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.MyLocation,
                                contentDescription = null,
                                tint = ResQNetCyan,
                                modifier = Modifier.size(18.dp)
                            )
                            Text(
                                text = "AUTOMATIC GPS GEO-TAG",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                color = ResQNetCyan,
                                letterSpacing = 1.sp
                            )
                        }

                        TextButton(
                            onClick = {
                                scope.launch {
                                    locationState = LocationState.Acquiring
                                    locationState = locationHelper.captureCurrentLocation()
                                }
                            },
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Text("Refresh Fix", fontSize = 11.sp, color = ResQNetCyan)
                        }
                    }

                    when (val state = locationState) {
                        is LocationState.Acquiring -> {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(16.dp),
                                    strokeWidth = 2.dp,
                                    color = ResQNetCyan
                                )
                                Text(
                                    text = "Acquiring live satellite coordinates...",
                                    fontSize = 12.sp,
                                    color = ResQNetTextSecondary
                                )
                            }
                        }
                        is LocationState.Success -> {
                            val snap = state.snapshot
                            val timeStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
                                .format(Date(snap.timestamp))

                            Column {
                                Text(
                                    text = "Lat: %.5f, Lon: %.5f".format(snap.latitude, snap.longitude),
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = ResQNetGreen
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "Accuracy: ±%.1fm  •  Acquired: %s".format(snap.accuracyM, timeStr),
                                    fontSize = 11.sp,
                                    color = ResQNetTextSecondary
                                )
                            }
                        }
                        is LocationState.Error -> {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(
                                    text = state.message,
                                    fontSize = 12.sp,
                                    color = ResQNetOrange
                                )
                                if (state.reason == LocationErrorReason.PERMISSION_DENIED) {
                                    Button(
                                        onClick = onRequestLocationPermission,
                                        shape = RoundedCornerShape(6.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = ResQNetOrange),
                                        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                                    ) {
                                        Text("Grant Location Access", fontSize = 11.sp, color = Color.White)
                                    }
                                }
                            }
                        }
                        else -> Unit
                    }
                }
            }

            // 2. Emergency Message Field
            Text(
                text = "EMERGENCY MESSAGE",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = ResQNetTextSecondary,
                letterSpacing = 1.sp
            )
            OutlinedTextField(
                value = messageText,
                onValueChange = { messageText = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Describe your urgent situation...", color = ResQNetTextMuted) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = ResQNetSurface,
                    unfocusedContainerColor = ResQNetSurface,
                    focusedBorderColor = ResQNetRed,
                    unfocusedBorderColor = ResQNetBorder,
                    focusedTextColor = ResQNetTextPrimary,
                    unfocusedTextColor = ResQNetTextPrimary
                ),
                shape = RoundedCornerShape(10.dp),
                maxLines = 4
            )

            // Quick Preset Chips for High Stress Situations
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(
                    "Rising Floodwater" to "Trapped by rapid water rising. On roof.",
                    "Medical" to "Injured person requiring urgent evacuation.",
                    "Infant / Elder" to "Elderly and infants stranded with no food."
                ).forEach { (label, preset) ->
                    SuggestionChip(
                        onClick = { messageText = preset },
                        label = { Text(label, fontSize = 11.sp) },
                        colors = SuggestionChipDefaults.suggestionChipColors(
                            containerColor = ResQNetSurfaceVariant,
                            labelColor = ResQNetTextPrimary
                        ),
                        border = SuggestionChipDefaults.suggestionChipBorder(enabled = true, borderColor = ResQNetBorder)
                    )
                }
            }

            // 3. Automated Triage Information
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(8.dp),
                colors = CardDefaults.cardColors(containerColor = ResQNetSurfaceVariant.copy(alpha = 0.5f)),
                border = CardDefaults.outlinedCardBorder().copy(brush = androidx.compose.ui.graphics.SolidColor(ResQNetBorder))
            ) {
                Row(
                    modifier = Modifier.padding(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Info,
                        contentDescription = null,
                        tint = ResQNetCyan,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = "Priority is automatically calculated by responders based on your situation, people count, and location.",
                        fontSize = 11.sp,
                        color = ResQNetTextSecondary,
                        lineHeight = 15.sp
                    )
                }
            }

            // 4. People Count Counter
            Text(
                text = "NUMBER OF PEOPLE REQUIRING RESCUE",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = ResQNetTextSecondary,
                letterSpacing = 1.sp
            )
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ResQNetSurface, RoundedCornerShape(10.dp))
                    .border(1.dp, ResQNetBorder, RoundedCornerShape(10.dp))
                .padding(horizontal = 14.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Default.Groups,
                        contentDescription = null,
                        tint = ResQNetCyan,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "$peopleCount Person(s)",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = ResQNetTextPrimary
                    )
                }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledIconButton(
                        onClick = { if (peopleCount > 1) peopleCount-- },
                        colors = IconButtonDefaults.filledIconButtonColors(containerColor = ResQNetSurfaceVariant),
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(Icons.Default.Remove, contentDescription = "Decrease", tint = ResQNetTextPrimary)
                    }
                    FilledIconButton(
                        onClick = { peopleCount++ },
                        colors = IconButtonDefaults.filledIconButtonColors(containerColor = ResQNetSurfaceVariant),
                        modifier = Modifier.size(36.dp)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Increase", tint = ResQNetTextPrimary)
                    }
                }
            }

            // 5. Vulnerable Individuals Checkbox
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(ResQNetSurface, RoundedCornerShape(10.dp))
                    .border(1.dp, ResQNetBorder, RoundedCornerShape(10.dp))
                    .clickable { hasVulnerablePeople = !hasVulnerablePeople }
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Checkbox(
                    checked = hasVulnerablePeople,
                    onCheckedChange = { hasVulnerablePeople = it },
                    colors = CheckboxDefaults.colors(
                        checkedColor = ResQNetOrange,
                        checkmarkColor = Color.White,
                        uncheckedColor = ResQNetBorder
                    )
                )
                Column {
                    Text(
                        text = "Vulnerable People Present",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = ResQNetTextPrimary
                    )
                    Text(
                        text = "Check if children, elderly, pregnant, or mobility-impaired are stranded.",
                        fontSize = 11.sp,
                        color = ResQNetTextSecondary
                    )
                }
            }

            // 6. Optional Additional Landmark / Notes
            Text(
                text = "OPTIONAL LANDMARK OR HOUSE NUMBER",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = ResQNetTextSecondary,
                letterSpacing = 1.sp
            )
            OutlinedTextField(
                value = additionalNotes,
                onValueChange = { additionalNotes = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("e.g. Blue roof near Church, 2nd floor", color = ResQNetTextMuted) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = ResQNetSurface,
                    unfocusedContainerColor = ResQNetSurface,
                    focusedBorderColor = ResQNetCyan,
                    unfocusedBorderColor = ResQNetBorder,
                    focusedTextColor = ResQNetTextPrimary,
                    unfocusedTextColor = ResQNetTextPrimary
                ),
                shape = RoundedCornerShape(10.dp),
                singleLine = true
            )

            Spacer(modifier = Modifier.height(10.dp))

            // 7. Dispatch Button
            Button(
                onClick = {
                    if (messageText.isBlank()) {
                        Toast.makeText(context, "Please enter emergency message", Toast.LENGTH_SHORT).show()
                        return@Button
                    }
                    isSubmitting = true
                    scope.launch {
                        val snap = (locationState as? LocationState.Success)?.snapshot
                        val combinedMessage = if (additionalNotes.isNotBlank()) {
                            "${messageText.trim()} [Landmark: ${additionalNotes.trim()}]"
                        } else {
                            messageText.trim()
                        }

                        // Determine district honestly without inventing Kerala districts
                        val resolvedDistrict = if (snap != null && snap.latitude in 12.5..13.6 && snap.longitude in 74.5..75.8) {
                            "mangaluru_urban"
                        } else if (snap == null) {
                            "unspecified"
                        } else {
                            null
                        }

                        // Infer appropriate triage severity automatically based on citizen distress text
                        val lowerMsg = combinedMessage.lowercase()
                        val inferredSeverity = when {
                            (lowerMsg.contains("safe") || lowerMsg.contains("fine")) && !lowerMsg.contains("not safe") -> SosSeverity.LOW
                            listOf("hungry", "food", "water", "ration", "supplies", "groceries", "blanket").any { lowerMsg.contains(it) } -> {
                                if (hasVulnerablePeople) SosSeverity.MODERATE else SosSeverity.LOW
                            }
                            listOf("trapped", "drowning", "rising water", "water rising", "water entering", "roof", "terrace", "attic", "neck deep", "chest deep", "collapse", "sinking").any { lowerMsg.contains(it) } -> SosSeverity.CRITICAL
                            listOf("injur", "bleeding", "cannot breathe", "can't breathe", "difficulty breathing", "heart", "oxygen", "fracture", "unconscious", "pregnant").any { lowerMsg.contains(it) } -> {
                                if (hasVulnerablePeople || peopleCount > 2) SosSeverity.CRITICAL else SosSeverity.HIGH
                            }
                            listOf("stranded", "cut off", "marooned", "cannot leave", "can't leave", "surrounded").any { lowerMsg.contains(it) } -> {
                                if (hasVulnerablePeople) SosSeverity.HIGH else SosSeverity.MODERATE
                            }
                            else -> if (hasVulnerablePeople) SosSeverity.HIGH else SosSeverity.MODERATE
                        }

                        val savedEntity = repository.createAndSaveSos(
                            messageText = combinedMessage,
                            peopleCount = peopleCount,
                            hasVulnerablePeople = hasVulnerablePeople,
                            severity = inferredSeverity,
                            latitude = snap?.latitude,
                            longitude = snap?.longitude,
                            accuracyM = snap?.accuracyM,
                            locationTimestamp = snap?.timestamp,
                            districtId = resolvedDistrict
                        )

                        // 1. Activate genuine Bluetooth Low Energy broadcast over the air for offline rescuer laptop detection
                        var bleErrorMessage: String? = null
                        try {
                            app.bleRelayManager.startAdvertisingBeacon(savedEntity) { success, statusMsg ->
                                scope.launch {
                                    if (success) {
                                        repository.updateDeliveryState(
                                            savedEntity.messageId,
                                            org.resqnet.sos.data.model.SosDeliveryState.BLE_TRANSMITTED
                                        )
                                    } else {
                                        repository.updateDeliveryState(
                                            savedEntity.messageId,
                                            org.resqnet.sos.data.model.SosDeliveryState.DELIVERY_FAILED
                                        )
                                    }
                                }
                            }
                        } catch (e: Exception) {
                            bleErrorMessage = e.message
                            android.util.Log.w("SosFormScreen", "BLE Broadcast start error: ${e.message}")
                            repository.updateDeliveryState(
                                savedEntity.messageId,
                                org.resqnet.sos.data.model.SosDeliveryState.DELIVERY_FAILED
                            )
                        }

                        // 2. Opportunistic HTTP upload if device happens to have network connectivity
                        var httpUploaded = false
                        try {
                            httpUploaded = app.httpUploader.uploadSingleBeacon(savedEntity)
                            if (httpUploaded) {
                                repository.updateDeliveryState(
                                    savedEntity.messageId,
                                    org.resqnet.sos.data.model.SosDeliveryState.ACKNOWLEDGED_BY_SERVER
                                )
                            }
                        } catch (e: Exception) {
                            // Expected when testing offline
                        }

                        val toastMsg = when {
                            httpUploaded -> "Distress Beacon Uploaded via Network"
                            app.bleRelayManager.isAdvertising -> "Distress Beacon Saved & BLE Broadcasting Over-the-Air"
                            bleErrorMessage != null -> "Saved locally in Room. BLE error: $bleErrorMessage"
                            else -> "Distress Beacon Saved locally in Room. Transmitting via BLE..."
                        }

                        Toast.makeText(context, toastMsg, Toast.LENGTH_LONG).show()

                        isSubmitting = false
                        onSosSubmitted()
                    }
                },
                enabled = !isSubmitting,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = ResQNetRed)
            ) {
                if (isSubmitting) {
                    CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White)
                } else {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.Send, contentDescription = null, tint = Color.White)
                        Text(
                            text = "DISPATCH SOS BEACON",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.5.sp,
                            color = Color.White
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}
