"""
Proposed Versioned SOS Message Contract (Phase 2 RFC).

STATUS: PROPOSAL / DRAFT — NOT CONNECTED TO PRODUCTION APIS YET.
Do not mount to production routes until end-to-end cryptographic signing
and gateway mesh synchronization are implemented.

Design Goals:
1. Compact representation for BLE/Wi-Fi Aware transmission (< 512 bytes encoded).
2. Store-and-forward mesh routing with deduplication (message_id vs incident_id).
3. Decentralized relay tracking with hop limits and TTL expiry to prevent broadcast storms.
4. Privacy-safe: zero personally identifiable information (PII) in beacon payloads.
"""

from enum import Enum
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class SOSSeverity(str, Enum):
    CRITICAL = "CRITICAL"    # Immediate life threat, submersion, trapped in water
    HIGH = "HIGH"            # Evacuation required, water entering structure, elderly/infants
    MODERATE = "MODERATE"    # Stranded, food/water shortage, power loss, road cut off
    LOW = "LOW"              # Precautionary check-in, property concern


class SOSDeliveryStatus(str, Enum):
    DRAFT = "DRAFT"                          # Created on local handset, not yet broadcast
    QUEUED_OFFLINE = "QUEUED_OFFLINE"        # Stored in device local buffer awaiting peer discovery
    RELAYING = "RELAYING"                    # In transit across peer mesh nodes
    DELIVERED_BACKEND = "DELIVERED_BACKEND"  # Ingested by internet-connected gateway server
    ACKNOWLEDGED_BY_RESCUER = "ACKNOWLEDGED_BY_RESCUER"  # Incident command assigned
    RESOLVED = "RESOLVED"                    # Evacuation / rescue confirmed complete


class SOSLocation(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0, description="WGS84 latitude")
    longitude: float = Field(..., ge=-180.0, le=180.0, description="WGS84 longitude")
    altitude_m: Optional[float] = Field(None, description="Altitude in meters above sea level if available")
    accuracy_m: float = Field(..., ge=0.0, description="Horizontal GPS 1-sigma uncertainty radius in meters")
    provider: str = Field(default="gps", description="Source provider: gps, fused, network, or manual_override")


class SOSRelayHop(BaseModel):
    node_id_hash: str = Field(..., description="Truncated SHA-256 hash of relay handset/gateway ID")
    relayed_at: datetime = Field(..., description="UTC timestamp when the packet was re-transmitted")
    rssi_dbm: Optional[int] = Field(None, description="Signal strength at time of receipt (-100 to 0 dBm)")
    transport: str = Field(default="BLE", description="Physical medium: BLE, WIFI_AWARE, LORA, CELLULAR")


class SOSMessageContract(BaseModel):
    """
    Versioned Peer-to-Peer Distress Beacon Contract.
    
    Compatible with:
    - Android Citizen SOS App (Offline Store-and-Forward Mesh)
    - Field Gateway Synchronizer
    - FastAPI Backend Ingestion Engine
    - Rescuer Command Dashboard
    """
    contract_version: str = Field(default="1.0.0", description="SemVer contract schema version")
    incident_id: str = Field(..., description="UUIDv4 identifying the originating emergency situation")
    message_id: str = Field(..., description="UUIDv4 unique to this individual transmission/update")
    created_at: datetime = Field(..., description="UTC timestamp of original SOS creation on victim handset")
    expires_at: datetime = Field(..., description="UTC timestamp after which nodes must drop this packet (TTL)")
    
    location: SOSLocation = Field(..., description="Victim location fix and horizontal accuracy")
    severity: SOSSeverity = Field(default=SOSSeverity.CRITICAL, description="Triage priority level")
    
    # Situational context
    hazard_context: Optional[str] = Field(
        None, 
        description="Hazard type: RIVERINE_INUNDATION, FLASH_FLOOD, LANDSLIDE_TRAPPED, URBAN_WATERLOGGING"
    )
    people_count: int = Field(default=1, ge=1, le=100, description="Number of individuals requiring rescue")
    medical_assistance_required: bool = Field(default=False, description="Presence of injuries or urgent medical needs")
    device_battery_pct: Optional[float] = Field(None, ge=0.0, le=100.0, description="Sender battery remaining")
    
    # Mesh routing metadata
    hop_count: int = Field(default=0, ge=0, description="Number of peer hops traversed so far")
    max_hops: int = Field(default=7, ge=1, le=15, description="Maximum hop limit to prevent broadcast storming")
    relay_history: List[SOSRelayHop] = Field(
        default_factory=list, 
        description="Ordered list of forwarding hops traversed through the mesh"
    )
    
    # Status and validation
    delivery_status: SOSDeliveryStatus = Field(
        default=SOSDeliveryStatus.QUEUED_OFFLINE, 
        description="Lifecycle tracking state"
    )
    cryptographic_signature: Optional[str] = Field(
        None, 
        description="Ed25519 digital signature or HMAC for packet integrity validation"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "contract_version": "1.0.0",
                "incident_id": "8f3b2e7a-4c12-4d95-812e-a5796df10a91",
                "message_id": "1c7a8b9e-2f34-4a61-9c88-e991278ba023",
                "created_at": "2026-10-23T14:30:00Z",
                "expires_at": "2026-10-24T14:30:00Z",
                "location": {
                    "latitude": 9.9312,
                    "longitude": 76.2673,
                    "altitude_m": 4.5,
                    "accuracy_m": 8.0,
                    "provider": "fused"
                },
                "severity": "CRITICAL",
                "hazard_context": "RIVERINE_INUNDATION",
                "people_count": 3,
                "medical_assistance_required": True,
                "device_battery_pct": 34.0,
                "hop_count": 2,
                "max_hops": 7,
                "relay_history": [
                    {
                        "node_id_hash": "a4f108bc",
                        "relayed_at": "2026-10-23T14:35:12Z",
                        "rssi_dbm": -78,
                        "transport": "BLE"
                    },
                    {
                        "node_id_hash": "62e09bc4",
                        "relayed_at": "2026-10-23T14:38:40Z",
                        "rssi_dbm": -65,
                        "transport": "WIFI_AWARE"
                    }
                ],
                "delivery_status": "RELAYING",
                "cryptographic_signature": "mock_ed25519_sig_abc123"
            }
        }
