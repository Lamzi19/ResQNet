package org.resqnet.sos.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import org.resqnet.sos.data.model.SosDeliveryState

@Composable
fun SosStateBadge(
    state: SosDeliveryState,
    modifier: Modifier = Modifier
) {
    val (bgColor, textColor, borderColor) = when (state) {
        SosDeliveryState.SAVED_LOCALLY -> Triple(
            Color(0xFF334155),
            Color(0xFFE2E8F0),
            Color(0xFF475569)
        )
        SosDeliveryState.WAITING_TO_TRANSMIT,
        SosDeliveryState.QUEUED_FOR_TRANSMISSION,
        @Suppress("DEPRECATION") SosDeliveryState.QUEUED_OFFLINE -> Triple(
            Color(0x33F97316),
            Color(0xFFFB923C),
            Color(0xFFF97316)
        )
        SosDeliveryState.BLE_TRANSMITTED,
        SosDeliveryState.TRANSMITTED_TO_PEER -> Triple(
            Color(0x3306B6D4),
            Color(0xFF22D3EE),
            Color(0xFF06B6D4)
        )
        SosDeliveryState.RECEIVED_BY_LAPTOP -> Triple(
            Color(0x338B5CF6),
            Color(0xFFA78BFA),
            Color(0xFF8B5CF6)
        )
        SosDeliveryState.RECEIVED_BY_PEER,
        @Suppress("DEPRECATION") SosDeliveryState.RELAYED_BY_PEER -> Triple(
            Color(0x333B82F6),
            Color(0xFF60A5FA),
            Color(0xFF3B82F6)
        )
        SosDeliveryState.UPLOADED_TO_SERVER,
        @Suppress("DEPRECATION") SosDeliveryState.UPLOADED_TO_BACKEND -> Triple(
            Color(0x336366F1),
            Color(0xFF818CF8),
            Color(0xFF6366F1)
        )
        SosDeliveryState.PERSISTED_BY_BACKEND,
        SosDeliveryState.ACKNOWLEDGED_BY_SERVER -> Triple(
            Color(0x330284C7),
            Color(0xFF38BDF8),
            Color(0xFF0284C7)
        )
        SosDeliveryState.ACKNOWLEDGED_BY_RESCUER,
        @Suppress("DEPRECATION") SosDeliveryState.DELIVERED_CONFIRMED -> Triple(
            Color(0x3310B981),
            Color(0xFF34D399),
            Color(0xFF10B981)
        )
        SosDeliveryState.DELIVERY_FAILED,
        SosDeliveryState.FAILED_OR_EXPIRED,
        @Suppress("DEPRECATION") SosDeliveryState.FAILED_EXPIRED -> Triple(
            Color(0x33EF4444),
            Color(0xFFF87171),
            Color(0xFFEF4444)
        )
    }

    Box(
        modifier = modifier
            .background(bgColor, RoundedCornerShape(6.dp))
            .border(1.dp, borderColor, RoundedCornerShape(6.dp))
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Text(
            text = state.displayName.uppercase(),
            color = textColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp
        )
    }
}
