"""
Warning Engine for ResQNet.
Evaluates multi-factor flood warning rules:
- Compound estuarine backwater interaction (high tide + river surge)
- River overtopping danger marks (GloFAS / CWC thresholds)
- Model calibrated risk thresholds
- Extreme downpour triggers (KSNDMC Very Heavy / Extreme Rain)
- Official IMD/KSNDMC disaster overrides
- Duplicate suppression with 3-hour cooldown
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from backend.app.config import settings, SUPPORTED_LOCATIONS
from backend.app.database.connection import SessionLocal
from backend.app.database.models import AlertEvent, OfficialAdvisory
from backend.app.schemas.prediction import PredictionResponse, AlertOut, TestAlertRequest


class WarningEngine:
    @staticmethod
    def evaluate_and_notify(
        prediction: PredictionResponse,
        db: Session
    ) -> Optional[AlertOut]:
        # Development simulation check: do NOT dispatch or persist production alerts
        # to ensure real operational alert history and cooldown timers remain pristine
        if getattr(prediction, "is_simulation", False):
            return None

        loc_id = prediction.location_id
        loc = SUPPORTED_LOCATIONS.get(loc_id)
        loc_name = loc.name if loc else loc_id
        
        prob = prediction.calibrated_risk_probability
        feats = prediction.input_feature_snapshot
        forecast_rain = feats.get("forecast_precip_24h_mm", 0.0)
        soil_sat = feats.get("soil_saturation_index", 0.0)
        past_72h = feats.get("past_72h_precip_mm", 0.0)
        river_ratio = feats.get("river_discharge_ratio", 0.0)
        backwater_risk = feats.get("coastal_backwater_risk_index", 0.0)
        tide_max = feats.get("tide_level_max_m", 1.0)
        
        # Check active official government advisories
        official = db.query(OfficialAdvisory).filter(
            OfficialAdvisory.is_active == True,
            OfficialAdvisory.alert_color.in_(["RED", "ORANGE"])
        ).first()
        
        severity = "INFO"
        title = ""
        msg = ""
        rule = ""
        is_official = False
        
        # Rule Hierarchy
        if official:
            severity = "EMERGENCY" if official.alert_color == "RED" else "WARNING"
            title = f"OFFICIAL {official.alert_color} ALERT: {official.issuing_agency}"
            msg = f"{official.description} Model predicted risk: {prob*100:.1f}%. Obey all official state directives."
            rule = f"OFFICIAL_OVERRIDE_{official.alert_color}"
            is_official = True
        elif backwater_risk >= 1.5 or (tide_max >= 1.40 and river_ratio >= 0.85):
            severity = "EMERGENCY"
            title = f"Compound Coastal-Estuarine Surge Warning: {loc_name}"
            msg = (
                f"Severe compound backwater risk (Index: {backwater_risk:.2f}). "
                f"Astronomical high tide ({tide_max:.2f}m CD) is blocking river discharge out to sea. "
                "Immediate low-lying estuarine inundation watch active."
            )
            rule = "RULE_COMPOUND_ESTUARINE_BACKWATER"
        elif river_ratio >= 1.0:
            severity = "WARNING"
            title = f"River Overtopping Warning: {loc_name}"
            msg = (
                f"River discharge has breached official warning capacity ({river_ratio:.1f}x threshold). "
                f"Forecast rain: {forecast_rain:.1f}mm. Riverine overtopping expected along floodplain."
            )
            rule = "RULE_RIVER_DANGER_LEVEL"
        elif prob >= settings.THRESHOLD_HIGH_WARNING or forecast_rain >= settings.KSNDMC_VERY_HEAVY_RAIN_MM:
            severity = "WARNING"
            title = f"High Flood Risk Warning: {loc_name}"
            msg = (
                f"Severe 24h inundation risk detected ({prob*100:.1f}% probability). "
                f"Forecast rain: {forecast_rain:.1f}mm, Antecedent 72h: {past_72h:.1f}mm. "
                "Low-lying areas along river corridors should monitor water levels."
            )
            rule = "RULE_HIGH_RISK_THRESHOLD"
        elif (prob >= settings.THRESHOLD_MODERATE_ADVISORY or 
              forecast_rain >= settings.KSNDMC_HEAVY_RAIN_MM or 
              river_ratio >= 0.75 or 
              (soil_sat > 0.75 and forecast_rain > 35.0)):
            severity = "ADVISORY"
            title = f"Flood Watch Advisory: {loc_name}"
            msg = (
                f"Elevated runoff conditions ({prob*100:.1f}% probability). "
                f"Forecast rain: {forecast_rain:.1f}mm on primed soils ({soil_sat*100:.0f}% saturation). "
                "Localized waterlogging and drainage bottlenecks possible."
            )
            rule = "RULE_MODERATE_RUNOFF_ADVISORY"
        else:
            return None
            
        # Cooldown & Suppression Logic
        cooldown_cutoff = datetime.utcnow() - timedelta(seconds=settings.WARNING_COOLDOWN_SECONDS)
        recent_alert = db.query(AlertEvent).filter(
            AlertEvent.location_id == loc_id,
            AlertEvent.timestamp >= cooldown_cutoff,
            AlertEvent.is_test == False
        ).order_by(AlertEvent.timestamp.desc()).first()
        
        severity_rank = {"INFO": 0, "ADVISORY": 1, "WARNING": 2, "EMERGENCY": 3}
        
        if recent_alert:
            current_rank = severity_rank.get(severity, 1)
            prev_rank = severity_rank.get(recent_alert.severity, 1)
            
            if current_rank <= prev_rank:
                recent_alert.suppressed_count += 1
                db.commit()
                return None
            else:
                print(f"[WarningEngine] Warning escalated from {recent_alert.severity} to {severity} for {loc_id}!")
                
        alert = AlertEvent(
            location_id=loc_id,
            location_name=loc_name,
            timestamp=datetime.utcnow(),
            severity=severity,
            title=title,
            message=msg,
            rule_triggered=rule,
            trigger_value=prob,
            threshold_value=settings.THRESHOLD_HIGH_WARNING if severity == "WARNING" else settings.THRESHOLD_MODERATE_ADVISORY,
            source="ResQNet Multi-Factor Warning Engine",
            is_official_override=is_official,
            is_test=False,
            suppressed_count=0
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        
        return AlertOut(
            id=alert.id,
            location_id=alert.location_id,
            location_name=alert.location_name,
            timestamp=alert.timestamp.isoformat() + "Z",
            severity=alert.severity,
            title=alert.title,
            message=alert.message,
            rule_triggered=alert.rule_triggered,
            is_official_override=alert.is_official_override,
            is_test=alert.is_test,
            suppressed_count=alert.suppressed_count
        )

    @staticmethod
    def trigger_test_alert(req: TestAlertRequest, db: Session) -> AlertOut:
        loc = SUPPORTED_LOCATIONS.get(req.location_id)
        loc_name = loc.name if loc else req.location_id
        
        alert = AlertEvent(
            location_id=req.location_id,
            location_name=loc_name,
            timestamp=datetime.utcnow(),
            severity=req.severity,
            title=req.title,
            message=req.message,
            rule_triggered="MANUAL_TEST_TRIGGER",
            trigger_value=0.99,
            threshold_value=settings.THRESHOLD_HIGH_WARNING,
            source="ResQNet Demo Console",
            is_official_override=False,
            is_test=True,
            suppressed_count=0
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        
        return AlertOut(
            id=alert.id,
            location_id=alert.location_id,
            location_name=alert.location_name,
            timestamp=alert.timestamp.isoformat() + "Z",
            severity=alert.severity,
            title=alert.title,
            message=alert.message,
            rule_triggered=alert.rule_triggered,
            is_official_override=alert.is_official_override,
            is_test=alert.is_test,
            suppressed_count=0
        )

    @staticmethod
    def get_recent_alerts(limit: int = 20, db: Session = None) -> List[AlertOut]:
        should_close = False
        if db is None:
            db = SessionLocal()
            should_close = True
        try:
            alerts = db.query(AlertEvent).order_by(AlertEvent.timestamp.desc()).limit(limit).all()
            return [
                AlertOut(
                    id=a.id,
                    location_id=a.location_id,
                    location_name=a.location_name,
                    timestamp=a.timestamp.isoformat() + "Z",
                    severity=a.severity,
                    title=a.title,
                    message=a.message,
                    rule_triggered=a.rule_triggered,
                    is_official_override=a.is_official_override,
                    is_test=a.is_test,
                    suppressed_count=a.suppressed_count
                )
                for a in alerts
            ]
        finally:
            if should_close:
                db.close()
