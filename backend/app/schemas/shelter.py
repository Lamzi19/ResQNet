"""
Pydantic schemas for Kerala Relief Camps, Live Occupancy,
Reservations, and Intelligent Allocation.
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class ShelterOccupancyInfo(BaseModel):
    shelter_id: str
    is_operational: bool
    total_capacity: Optional[int] = None
    verified_operational_capacity: Optional[int] = None
    occupied_count: int
    reserved_count: int
    available_count: int
    occupancy_pct: Optional[float] = None
    status: str  # "AVAILABLE", "LIMITED", "FULL", "UNVERIFIED"
    is_simulated: bool = False
    verification_notes: Optional[str] = None
    updated_by: str
    updated_at: str


class ReliefFacilityItem(BaseModel):
    id: str
    sl_no: int
    district_id: str
    district_name: str
    name: str
    ownership: Optional[str] = None
    lsg: Optional[str] = None
    village: Optional[str] = None
    facility_type: Optional[str] = None
    capacity_persons: Optional[int] = None
    rooms: Optional[str] = None
    toilets: Optional[str] = None
    disabled_friendly: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    coordinate_status: str
    coordinates_swapped: bool = False
    source_date: str = "2020-08-05"
    facility_status: str = "DESIGNATED_POTENTIAL_FACILITY"
    is_verified_operational_2026: bool = False
    official_verification_status: str = "HISTORICAL_REGISTRY_UNVERIFIED"
    status_notice: str
    occupancy: Optional[ShelterOccupancyInfo] = None


class ReliefFacilitiesResponse(BaseModel):
    total_facilities_in_registry: int
    mapped_facilities_count: int
    unmapped_facilities_count: int
    filtered_count: int
    district_filter: Optional[str] = None
    source_agency: str = "Kerala State Emergency Operations Centre (SEOC GIS Cell)"
    source_compilation_date: str = "2020-08-05"
    disclaimer: str = (
        "Facilities listed reflect the SEOC GIS baseline registry (August 2020). "
        "They are designated potential relief shelters, NOT verified real-time operational or staffed camps. "
        "During flood emergencies, confirm actual opening with the local Village Officer or Taluk Disaster Management Control Room (1077 / 112)."
    )
    facilities: List[ReliefFacilityItem]


# -------------------------------------------------------------
# RESERVATION & CHECK-IN SCHEMAS
# -------------------------------------------------------------

class ReservationRequest(BaseModel):
    shelter_id: str
    group_size: int = Field(default=1, ge=1, le=10, description="Number of persons traveling together")
    citizen_contact: Optional[str] = Field(None, max_length=100, description="Optional citizen reference or contact alias")
    notes: Optional[str] = Field(None, max_length=250, description="Special needs, elderly/infants")
    expiry_minutes: int = Field(default=120, ge=15, le=720, description="Reservation hold duration in minutes")


class ReservationResponse(BaseModel):
    id: str
    shelter_id: str
    shelter_name: str
    district_id: str
    group_size: int
    status: str  # ACTIVE, CHECKED_IN, CANCELLED, EXPIRED
    created_at: str
    expires_at: str
    checked_in_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    available_capacity_after: int
    message: str


class CheckInRequest(BaseModel):
    reservation_id: str
    staff_pin: Optional[str] = Field(None, description="Optional staff authorization code for physical verification")


class CancelReservationRequest(BaseModel):
    reservation_id: str
    reason: Optional[str] = Field(None, max_length=200)


class StaffCapacityUpdateRequest(BaseModel):
    shelter_id: str
    is_operational: bool
    verified_operational_capacity: Optional[int] = Field(None, ge=0)
    occupied_count: Optional[int] = Field(None, ge=0)
    verification_notes: Optional[str] = None
    updated_by: str = Field(default="Camp Officer / Taluk Incident Command")
    staff_pin: str = Field(..., description="Staff access credential (demo default: 'kerala112')")
    is_simulated: Optional[bool] = Field(default=None, description="Flag for drill simulation vs real emergency")


# -------------------------------------------------------------
# INTELLIGENT ALLOCATION / RECOMMENDATION SCHEMAS
# -------------------------------------------------------------

class ShelterRecommendationRequest(BaseModel):
    user_lat: float
    user_lng: float
    group_size: int = Field(default=1, ge=1, le=10)
    district_id: Optional[str] = None
    max_distance_km: Optional[float] = 60.0


class RecommendedShelterItem(BaseModel):
    shelter_id: str
    name: str
    district_id: str
    district_name: str
    latitude: float
    longitude: float
    straight_line_distance_km: float
    estimated_road_distance_km: Optional[float] = None
    occupancy_status: str  # "AVAILABLE", "LIMITED", "FULL", "UNVERIFIED"
    verified_operational: bool
    available_capacity: int
    total_capacity: Optional[int] = None
    recommendation_reason: str
    is_primary: bool
    is_alternative: bool
    hazard_warning: Optional[str] = None


class ShelterRecommendationResponse(BaseModel):
    primary_recommendation: Optional[RecommendedShelterItem] = None
    alternatives: List[RecommendedShelterItem] = []
    nearest_facility_was_full: bool = False
    nearest_full_facility_name: Optional[str] = None
    group_size: int
    unverified_disclaimer: str = (
        "Unverified facilities have not confirmed active staffing or opening. "
        "ResQNet recommends verified operational centers with confirmed available beds."
    )
    hazard_disclaimer: str = (
        "Road navigation does not guarantee flood clearance. "
        "Consult local emergency responders or call 1077/112 before moving."
    )
