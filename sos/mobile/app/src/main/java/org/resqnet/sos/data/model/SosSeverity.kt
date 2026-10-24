package org.resqnet.sos.data.model

/**
 * Priority levels for emergency distress messages.
 */
enum class SosSeverity(val label: String, val description: String) {
    CRITICAL(
        label = "Critical Life Threat",
        description = "Submersion, trapped in rapid floodwater, immediate rescue required"
    ),
    HIGH(
        label = "High Urgent",
        description = "Water entering residence, infants/elderly stranded, power/food cut off"
    ),
    MODERATE(
        label = "Moderate Concern",
        description = "Isolated by flooded roads, safe elevation for now, needs supplies"
    ),
    LOW(
        label = "Precautionary",
        description = "Status check-in, property alert, non-immediate distress"
    )
}
