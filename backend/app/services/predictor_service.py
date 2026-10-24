"""
Multi-Model Predictor Service for ResQNet.
Supports dynamic switching and side-by-side comparison between:
- Version 1.0.0: Preserved Rainfall & Soil Moisture Random Forest (15 features)
- Version 2.0.0: Upgraded Multi-Factor Coastal & Riverine Intelligence Pipeline (20 features)

Generates calibrated flood probabilities, categorizes primary flood mechanisms
(Riverine Overflow, Urban Pluvial, Coastal Compound), and calculates factor deviations.
"""

import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
from typing import Dict, Any, Optional, List

from backend.app.config import settings, SUPPORTED_LOCATIONS
from backend.app.services.weather_service import WeatherService
from backend.app.database.connection import SessionLocal
from backend.app.database.models import PredictionRecord
from backend.app.schemas.prediction import PredictionResponse, FactorContribution

# Cache for loaded artifacts
_LOADED_ARTIFACTS: Dict[str, Dict[str, Any]] = {}


def get_artifact(version: str = "2.0.0") -> Dict[str, Any]:
    global _LOADED_ARTIFACTS
    if version not in _LOADED_ARTIFACTS:
        path = settings.MODEL_V2_ARTIFACT_PATH if version == "2.0.0" else settings.MODEL_V1_ARTIFACT_PATH
        if not os.path.exists(path):
            # Fallback to v1 if v2 path does not exist
            path = settings.MODEL_V1_ARTIFACT_PATH
            version = "1.0.0"
        if not os.path.exists(path):
            raise FileNotFoundError(f"Model artifact not found at {path}.")

        art = joblib.load(path)
        _LOADED_ARTIFACTS[version] = art
        print(f"[PredictorService] Loaded model artifact version {version} ({art.get('model_name', 'Random Forest')}).")
    return _LOADED_ARTIFACTS[version]


# Alias for backward compatibility
load_model_artifact = get_artifact


class PredictorService:
    @staticmethod
    def predict(
        location_id: str,
        model_version: str = "2.0.0",
        manual_forecast_override: Optional[float] = None,
        simulation_scenario: Optional[str] = None,
        db_session = None
    ) -> PredictionResponse:
        if location_id not in SUPPORTED_LOCATIONS:
            raise ValueError(f"Unknown location '{location_id}'.")

        loc = SUPPORTED_LOCATIONS[location_id]

        # Determine artifact version
        if model_version not in ["1.0.0", "2.0.0"]:
            model_version = "2.0.0"

        artifact = get_artifact(model_version)
        pipeline = artifact["pipeline"]
        base_pipeline = artifact.get("baseline_pipeline")

        # Build features for the requested model version
        df_feat, feat_dict = WeatherService.build_feature_vector(
            location_id=location_id,
            model_version=model_version,
            manual_forecast_override=manual_forecast_override,
            simulation_scenario=simulation_scenario
        )
        weather = WeatherService.get_weather(location_id)

        # Inference
        calib_prob = float(pipeline.predict_proba(df_feat)[0, 1])
        base_prob = float(base_pipeline.predict_proba(df_feat)[0, 1]) if base_pipeline else calib_prob

        # Risk categorization
        forecast_rain = feat_dict.get("forecast_precip_24h_mm", 0.0)
        soil_sat = feat_dict.get("soil_saturation_index", 0.0)
        river_ratio = feat_dict.get("river_discharge_ratio", 0.0)
        backwater_risk = feat_dict.get("coastal_backwater_risk_index", 0.0)

        if (calib_prob >= settings.THRESHOLD_HIGH_WARNING or
            forecast_rain >= settings.KSNDMC_VERY_HEAVY_RAIN_MM or
            river_ratio >= 1.0 or
            backwater_risk >= 2.0):
            risk_level = "HIGH_WARNING"
            risk_level_code = 2
        elif (calib_prob >= settings.THRESHOLD_MODERATE_ADVISORY or
              forecast_rain >= settings.KSNDMC_HEAVY_RAIN_MM or
              river_ratio >= 0.75 or
              (soil_sat > 0.75 and forecast_rain > 35.0)):
            risk_level = "MODERATE_ALERT"
            risk_level_code = 1
        else:
            risk_level = "LOW"
            risk_level_code = 0

        # Determine whether decision was driven by ML model probability or physical rule criteria
        rule_reasons = []
        if calib_prob >= settings.THRESHOLD_HIGH_WARNING:
            rule_reasons.append(f"Model calibrated probability ({calib_prob*100:.1f}%) >= high warning threshold ({settings.THRESHOLD_HIGH_WARNING*100:.1f}%)")
        if forecast_rain >= settings.KSNDMC_VERY_HEAVY_RAIN_MM:
            rule_reasons.append(f"Forecast rain ({forecast_rain:.1f}mm) >= IMD Very Heavy Rain threshold ({settings.KSNDMC_VERY_HEAVY_RAIN_MM}mm)")
        if river_ratio >= 1.0:
            rule_reasons.append(f"River discharge ratio ({river_ratio:.2f}x) >= warning capacity")
        if backwater_risk >= 2.0:
            rule_reasons.append(f"Compound backwater index ({backwater_risk:.2f}) >= critical threshold")

        if risk_level == "HIGH_WARNING":
            rule_vs_model_reason = "HIGH_WARNING triggered: " + ("; ".join(rule_reasons) if rule_reasons else "High flood threshold reached")
        elif risk_level == "MODERATE_ALERT":
            mod_reasons = []
            if calib_prob >= settings.THRESHOLD_MODERATE_ADVISORY:
                mod_reasons.append(f"Model calibrated probability ({calib_prob*100:.1f}%) >= advisory threshold ({settings.THRESHOLD_MODERATE_ADVISORY*100:.1f}%)")
            if forecast_rain >= settings.KSNDMC_HEAVY_RAIN_MM:
                mod_reasons.append(f"Forecast rain ({forecast_rain:.1f}mm) >= IMD Heavy Rain threshold ({settings.KSNDMC_HEAVY_RAIN_MM}mm)")
            if river_ratio >= 0.75:
                mod_reasons.append(f"River discharge ratio ({river_ratio:.2f}x) in watch range")
            if soil_sat > 0.75 and forecast_rain > 35.0:
                mod_reasons.append(f"Soil saturation ({soil_sat*100:.0f}%) priming runoff")
            rule_vs_model_reason = "MODERATE_ALERT triggered: " + ("; ".join(mod_reasons) if mod_reasons else "Advisory runoff conditions")
        else:
            rule_vs_model_reason = f"LOW risk: Calibrated probability ({calib_prob*100:.1f}%) and forecast rain ({forecast_rain:.1f}mm) within normal capacity"

        # Determine primary flood mechanism
        mechanism = "LOW_RISK"
        is_coastal = location_id in ["ullal", "mangaluru_urban"] or getattr(loc, "is_coastal", False)
        if risk_level_code > 0:
            if backwater_risk >= 1.2 or (is_coastal and feat_dict.get("tide_level_max_m", 1.0) >= 1.35):
                mechanism = "COASTAL_COMPOUND"
            elif river_ratio >= 0.75 or location_id in ["bantwal", "belthangady"]:
                mechanism = "RIVERINE_OVERFLOW"
            else:
                mechanism = "URBAN_PLUVIAL"

        # Factor contributions
        factors = PredictorService._calculate_factors(feat_dict, calib_prob, model_version, loc=loc)

        is_simulation = bool(simulation_scenario or manual_forecast_override is not None)

        # Persist record
        should_close = False
        if db_session is None:
            db_session = SessionLocal()
            should_close = True

        try:
            record_source = f"Synthetic Simulation ({simulation_scenario or 'Manual Override'})" if is_simulation else weather.get("data_source", "Open-Meteo & GloFAS")
            freshness_status = "SIMULATED" if is_simulation else weather.get("freshness", "LIVE")

            record = PredictionRecord(
                location_id=location_id,
                timestamp=datetime.utcnow(),
                weather_observed_at=weather.get("observed_time"),
                risk_probability=round(calib_prob, 4),
                baseline_probability=round(base_prob, 4),
                risk_level=risk_level,
                risk_category_code=risk_level_code,
                forecast_precip_24h_mm=round(forecast_rain, 1),
                past_72h_precip_mm=round(feat_dict.get("past_72h_precip_mm", 0.0), 1),
                soil_saturation_index=round(soil_sat, 3),
                top_factors=[f.model_dump() for f in factors],
                input_features=feat_dict,
                model_version=model_version,
                data_source=record_source,
                data_freshness_status=freshness_status,
                is_experimental=True
            )
            db_session.add(record)
            db_session.commit()
        except Exception as e:
            print(f"[PredictorService] DB log error: {e}")
            db_session.rollback()
        finally:
            if should_close:
                db_session.close()

        is_kerala = (getattr(loc, 'region', 'kerala') == 'kerala')
        is_rule_based = is_kerala
        risk_estimate_type = "Rule-based flood-risk estimate (IMD/KSDMA Criteria)" if is_kerala else "Calibrated ML probability"
        display_model_name = "ResQNet Kerala Rule-Engine" if is_kerala else artifact.get("model_name", "Random Forest Classifier")

        disclaimer = (
            "OPERATIONAL FLOOD RISK ESTIMATE: Kerala risk estimates combine IMD rainfall thresholds, "
            "CWC river level limits, GloFAS river discharge, and astronomical tidal harmonics. They DO NOT replace "
            "official directives or evacuation orders issued by the IMD, KSDMA, or District Disaster Management Authority."
            if is_kerala else
            "ARCHIVE REPRODUCIBILITY BENCHMARK: Karnataka v1/v2 machine-learning models calibrated on historical "
            "coastal Karnataka flood gauges (2020-2024)."
        )

        return PredictionResponse(
            location_id=location_id,
            location_name=loc.name,
            prediction_timestamp=datetime.utcnow().isoformat() + "Z",
            weather_observed_at=weather.get("observed_time", ""),
            horizon_hours=24,
            calibrated_risk_probability=round(calib_prob, 4),
            baseline_risk_probability=round(base_prob, 4),
            risk_level=risk_level,
            risk_level_code=risk_level_code,
            primary_flood_mechanism=mechanism,
            key_factors=factors,
            input_feature_snapshot=feat_dict,
            model_version=model_version,
            model_name=display_model_name,
            features_used_count=len(artifact.get("feature_names", [])),
            data_source="Synthetic Simulation Scenario" if is_simulation else "Open-Meteo ECMWF Forecast, GloFAS River & INCOIS Tidal Harmonics",
            data_freshness="SIMULATED" if is_simulation else weather.get("freshness", "LIVE"),
            is_rule_based=is_rule_based,
            risk_estimate_type=risk_estimate_type,
            is_experimental=True,
            is_simulation=is_simulation,
            simulation_scenario=simulation_scenario,
            rule_vs_model_reason=rule_vs_model_reason,
            disclaimer=disclaimer
        )

    @staticmethod
    def _calculate_factors(feats: Dict[str, Any], prob: float, model_version: str, loc: Any = None) -> List[FactorContribution]:
        factors = []
        is_kerala = getattr(loc, "region", "kerala") == "kerala" if loc else False

        # 1. River Discharge (for v2)
        if model_version == "2.0.0" and ("upstream_netravati_discharge_m3s" in feats or "river_discharge_m3s" in feats):
            val = feats.get("river_discharge_m3s", feats.get("upstream_netravati_discharge_m3s", 0.0))
            if is_kerala and loc:
                basin_label = getattr(loc, "basin", "Regional River Basin")
                warn_thresh = getattr(loc, "river_warning_threshold_m3s", 850.0) or 850.0
                danger_thresh = getattr(loc, "river_danger_threshold_m3s", 1400.0) or 1400.0
                norm = warn_thresh * 0.3
                ratio = round(val / norm, 2) if norm > 0 else 0.1

                if val >= danger_thresh:
                    imp = "CRITICAL"
                    desc = f"{basin_label} discharge exceeding CWC danger mark (>{danger_thresh:.0f} m³/s)."
                elif val >= warn_thresh:
                    imp = "HIGH"
                    desc = f"{basin_label} discharge exceeding official CWC warning threshold ({warn_thresh:.0f} m³/s)."
                elif val >= norm * 1.5:
                    imp = "MODERATE"
                    desc = f"Elevated monsoon river discharge in {basin_label} catchment."
                else:
                    imp = "LOW"
                    desc = f"{basin_label} modeled discharge within normal non-flood channel capacity."

                factors.append(FactorContribution(
                    feature="upstream_river_discharge_m3s",
                    label=f"{basin_label} Basin Discharge",
                    value=round(val, 1),
                    unit="m³/s",
                    baseline_normal=round(norm, 1),
                    deviation_ratio=ratio,
                    impact_level=imp,
                    description=desc
                ))
            else:
                norm = 150.0
                ratio = round(val / norm, 2)
                if val >= 1000.0:
                    imp = "CRITICAL"
                    desc = "Netravati river discharge exceeding Bantwal danger mark (>1,000 m³/s)."
                elif val >= 650.0:
                    imp = "HIGH"
                    desc = "River discharge exceeding official warning threshold (650 m³/s)."
                elif val >= 300.0:
                    imp = "MODERATE"
                    desc = "Elevated monsoon river discharge in upper Netravati catchment."
                else:
                    imp = "LOW"
                    desc = "River discharge within normal non-flood channel capacity."

                factors.append(FactorContribution(
                    feature="upstream_netravati_discharge_m3s",
                    label="Netravati River Discharge (Bantwal Gauge)",
                    value=round(val, 1),
                    unit="m³/s",
                    baseline_normal=norm,
                    deviation_ratio=ratio,
                    impact_level=imp,
                    description=desc
                ))

        # 2. 24h Forecast Precipitation
        val = feats.get("forecast_precip_24h_mm", 0.0)
        norm = 10.0
        ratio = round(val / norm, 2)
        if val >= 115.6:
            imp = "CRITICAL"
            desc = "Extremely heavy forecast downpour exceeding KSNDMC disaster criteria."
        elif val >= 64.5:
            imp = "HIGH"
            desc = "Heavy rainfall forecast capable of causing localized urban/river inundation."
        elif val >= 25.0:
            imp = "MODERATE"
            desc = "Moderate steady rainfall expected over 24-hour window."
        else:
            imp = "LOW"
            desc = "Light to normal rainfall forecast within drainage capacity."

        factors.append(FactorContribution(
            feature="forecast_precip_24h_mm",
            label="24h Forecast Rainfall",
            value=round(val, 1),
            unit="mm",
            baseline_normal=norm,
            deviation_ratio=ratio,
            impact_level=imp,
            description=desc
        ))

        # 3. 72h Antecedent Rainfall
        val = feats.get("past_72h_precip_mm", 0.0)
        norm = 25.0
        ratio = round(val / norm, 2)
        if val >= 150.0:
            imp = "CRITICAL"
            desc = "Severe antecedent catchment saturation; subsequent rain converts almost 100% to surface runoff."
        elif val >= 75.0:
            imp = "HIGH"
            desc = "High 3-day rainfall volume significantly priming regional riverbanks."
        elif val >= 30.0:
            imp = "MODERATE"
            desc = "Moderate antecedent precipitation present."
        else:
            imp = "LOW"
            desc = "Low antecedent accumulation, soil has absorption capacity."

        factors.append(FactorContribution(
            feature="past_72h_precip_mm",
            label="72h Antecedent Rainfall",
            value=round(val, 1),
            unit="mm",
            baseline_normal=norm,
            deviation_ratio=ratio,
            impact_level=imp,
            description=desc
        ))

        # 4. Coastal Tidal Backwater Index (for v2)
        if model_version == "2.0.0" and "coastal_backwater_risk_index" in feats:
            val = feats["coastal_backwater_risk_index"]
            norm = 0.30
            ratio = round(val / norm, 2) if norm > 0 else 1.0
            if val >= 1.5:
                imp = "CRITICAL"
                desc = "Severe compound risk: spring high tide blocking river discharge out to sea."
            elif val >= 0.8:
                imp = "HIGH"
                desc = "Elevated tide and river volume causing estuarine backwater stalling."
            else:
                imp = "LOW"
                desc = "Normal tidal conveyance; estuarine outlet draining freely."

            factors.append(FactorContribution(
                feature="coastal_backwater_risk_index",
                label="Coastal Backwater Risk Index",
                value=round(val, 2),
                unit="index (0-3+)",
                baseline_normal=norm,
                deviation_ratio=ratio,
                impact_level=imp,
                description=desc
            ))

        # 5. Topsoil Saturation
        val = feats.get("soil_saturation_index", 0.0)
        norm = 0.50
        ratio = round(val / norm, 2)
        factors.append(FactorContribution(
            feature="soil_saturation_index",
            label="Soil Saturation Index",
            value=round(val, 3),
            unit="ratio (0-1)",
            baseline_normal=norm,
            deviation_ratio=ratio,
            impact_level="HIGH" if val >= 0.85 else ("MODERATE" if val >= 0.65 else "LOW"),
            description="Near total topsoil saturation approaching runoff threshold." if val >= 0.85 else "Normal unsaturated soil moisture."
        ))

        return factors
