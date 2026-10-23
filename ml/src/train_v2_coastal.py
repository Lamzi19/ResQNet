"""
Multi-Factor Coastal & Riverine Model Training & Defensible Comparison for ResQNet.
Trains and compares:
1. Baseline: Logistic Regression
2. Model v1 (Rainfall & Soil Moisture only, 15 features)
3. Model v2 (Multi-Factor Coastal & Riverine, 20 features)

Evaluated strictly out-of-time on held-out future monsoon years (2023-2024 test set),
with breakdown by flood mechanism (Riverine Overflow vs Urban Pluvial vs Coastal Compound).

Outputs:
- Serialized v2 artifact: ml/artifacts/flood_model_pipeline_v2_coastal.joblib
- Comprehensive comparison report: ml/reports/model_v1_v2_comparison_report.json
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from datetime import datetime

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, roc_auc_score, average_precision_score,
    brier_score_loss
)

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "processed_features_v2_coastal.csv")
ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts")
REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "reports")

V1_ARTIFACT_PATH = os.path.join(ARTIFACTS_DIR, "flood_model_pipeline_v1.joblib")
V2_ARTIFACT_PATH = os.path.join(ARTIFACTS_DIR, "flood_model_pipeline_v2_coastal.joblib")
COMPARISON_REPORT_PATH = os.path.join(REPORTS_DIR, "model_v1_v2_comparison_report.json")

# Features for Model v1 (Rainfall & Soil only)
V1_FEATURE_COLS = [
    "past_24h_precip_mm",
    "past_48h_precip_mm",
    "past_72h_precip_mm",
    "past_120h_precip_mm",
    "antecedent_precip_index",
    "soil_moisture_surface",
    "soil_moisture_deep",
    "soil_saturation_index",
    "wind_speed_max_kmh",
    "forecast_precip_24h_mm",
    "forecast_max_hourly_rate_mm",
    "elevation_m",
    "is_monsoon",
    "month_sin",
    "month_cos"
]

# Features for Model v2 (Multi-Factor Coastal Intelligence)
V2_FEATURE_COLS = V1_FEATURE_COLS + [
    "river_discharge_m3s",
    "upstream_netravati_discharge_m3s",
    "river_discharge_ratio",
    "tide_level_max_m",
    "coastal_backwater_risk_index"
]

TARGET_COL = "flood_event_24h"


def evaluate_pipeline(pipeline, X_test, y_test, model_name, op_threshold=0.03):
    y_prob = pipeline.predict_proba(X_test)[:, 1]
    y_pred_default = (y_prob >= 0.50).astype(int)
    y_pred_op = (y_prob >= op_threshold).astype(int)
    
    cm_def = confusion_matrix(y_test, y_pred_default)
    tn_d, fp_d, fn_d, tp_d = cm_def.ravel()
    
    cm_op = confusion_matrix(y_test, y_pred_op)
    tn_o, fp_o, fn_o, tp_o = cm_op.ravel()
    
    acc = accuracy_score(y_test, y_pred_default)
    roc_auc = roc_auc_score(y_test, y_prob)
    pr_auc = average_precision_score(y_test, y_prob)
    brier = brier_score_loss(y_test, y_prob)
    
    return {
        "model_name": model_name,
        "roc_auc": round(float(roc_auc), 4),
        "pr_auc": round(float(pr_auc), 4),
        "brier_score_loss": round(float(brier), 4),
        "default_threshold_0_50": {
            "accuracy": round(float(acc), 4),
            "precision": round(float(precision_score(y_test, y_pred_default, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, y_pred_default, zero_division=0)), 4),
            "f1_score": round(float(f1_score(y_test, y_pred_default, zero_division=0)), 4),
            "true_positives": int(tp_d),
            "false_positives": int(fp_d),
            "false_negatives": int(fn_d),
            "true_negatives": int(tn_d)
        },
        "operational_threshold_0_03": {
            "threshold": op_threshold,
            "accuracy": round(float(accuracy_score(y_test, y_pred_op)), 4),
            "precision": round(float(precision_score(y_test, y_pred_op, zero_division=0)), 4),
            "recall": round(float(recall_score(y_test, y_pred_op, zero_division=0)), 4),
            "f1_score": round(float(f1_score(y_test, y_pred_op, zero_division=0)), 4),
            "true_positives": int(tp_o),
            "false_positives": int(fp_o),
            "false_negatives": int(fn_o),
            "true_negatives": int(tn_o),
            "false_alarm_rate": round(float(fp_o / (fp_o + tn_o)), 4),
            "miss_rate": round(float(fn_o / (fn_o + tp_o)), 4)
        }
    }, y_prob


def run_v2_training():
    print(f"Loading multi-factor dataset from {DATA_PATH}...")
    df = pd.read_csv(DATA_PATH)
    
    train_mask = df["split"] == "train"
    test_mask = df["split"] == "test"
    
    y_train = df.loc[train_mask, TARGET_COL]
    y_test = df.loc[test_mask, TARGET_COL]
    
    print(f"Train samples (2018-2022): {len(y_train)} | Positives: {y_train.sum()} ({y_train.mean()*100:.2f}%)")
    print(f"Test samples  (2023-2024): {len(y_test)} | Positives: {y_test.sum()} ({y_test.mean()*100:.2f}%)")
    
    # -------------------------------------------------------------
    # 1. Baseline Model (Logistic Regression on v2 features)
    # -------------------------------------------------------------
    print("\n[1/3] Fitting Linear Baseline (Logistic Regression)...")
    base_pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(class_weight="balanced", random_state=42, max_iter=1000))
    ])
    base_pipe.fit(df.loc[train_mask, V2_FEATURE_COLS], y_train)
    base_metrics, _ = evaluate_pipeline(base_pipe, df.loc[test_mask, V2_FEATURE_COLS], y_test, "Linear Baseline (LogReg)")
    
    # -------------------------------------------------------------
    # 2. Model v1 (Preserved Rainfall & Soil Model, 15 features)
    # -------------------------------------------------------------
    print("[2/3] Evaluating Preserved Model v1 (Rainfall & Soil Only)...")
    v1_artifact = joblib.load(V1_ARTIFACT_PATH)
    v1_pipeline = v1_artifact["pipeline"]
    v1_metrics, v1_probs = evaluate_pipeline(v1_pipeline, df.loc[test_mask, V1_FEATURE_COLS], y_test, "Model v1 (Rainfall & Soil)")
    
    # -------------------------------------------------------------
    # 3. Model v2 (Multi-Factor Coastal & Riverine, 20 features)
    # -------------------------------------------------------------
    print("[3/3] Training Upgraded Model v2 (Multi-Factor Coastal & Riverine)...")
    rf_v2_raw = RandomForestClassifier(
        n_estimators=180,
        max_depth=9,
        min_samples_split=5,
        min_samples_leaf=2,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1
    )
    v2_pipeline_raw = Pipeline([
        ("scaler", StandardScaler()),
        ("rf", rf_v2_raw)
    ])
    v2_pipeline_raw.fit(df.loc[train_mask, V2_FEATURE_COLS], y_train)
    
    # Sigmoid probability calibration on training set with 3-fold internal CV
    calibrated_v2 = CalibratedClassifierCV(estimator=v2_pipeline_raw, method="sigmoid", cv=3)
    calibrated_v2.fit(df.loc[train_mask, V2_FEATURE_COLS], y_train)
    
    v2_metrics, v2_probs = evaluate_pipeline(calibrated_v2, df.loc[test_mask, V2_FEATURE_COLS], y_test, "Model v2 (Multi-Factor Coastal)", op_threshold=0.03)
    
    # Feature importances for v2
    fitted_rf_v2 = v2_pipeline_raw.named_steps["rf"]
    v2_importances = [
        {"feature": f, "importance": round(float(imp), 4)}
        for f, imp in zip(V2_FEATURE_COLS, fitted_rf_v2.feature_importances_)
    ]
    v2_importances.sort(key=lambda x: x["importance"], reverse=True)
    
    # Mechanism-specific breakdown on held-out test set
    test_df = df.loc[test_mask].copy()
    test_df["v1_prob"] = v1_probs
    test_df["v2_prob"] = v2_probs
    test_df["v1_pred_op"] = (v1_probs >= 0.03).astype(int)
    test_df["v2_pred_op"] = (v2_probs >= 0.03).astype(int)
    
    mechanism_results = {}
    for mech in ["RIVERINE_OVERFLOW", "COASTAL_COMPOUND", "URBAN_PLUVIAL"]:
        mech_subset = test_df[test_df["flood_mechanism"] == mech]
        if len(mech_subset) > 0:
            y_mech = mech_subset[TARGET_COL]
            pos_count = int(y_mech.sum())
            v1_detected = int(((mech_subset["v1_pred_op"] == 1) & (y_mech == 1)).sum())
            v2_detected = int(((mech_subset["v2_pred_op"] == 1) & (y_mech == 1)).sum())
            v1_rec = round(v1_detected / pos_count, 4) if pos_count > 0 else 0.0
            v2_rec = round(v2_detected / pos_count, 4) if pos_count > 0 else 0.0
            mechanism_results[mech] = {
                "total_events": pos_count,
                "v1_detected": v1_detected,
                "v1_recall": v1_rec,
                "v2_detected": v2_detected,
                "v2_recall": v2_rec,
                "recall_gain_pct": round((v2_rec - v1_rec) * 100, 2)
            }
            
    # Compile comparison report
    report = {
        "evaluation_timestamp": datetime.now().isoformat(),
        "train_period": "2018-01-06 to 2022-12-31",
        "test_period": "2023-01-01 to 2024-12-31 (Held-out Future Monsoons)",
        "train_samples": int(len(y_train)),
        "test_samples": int(len(y_test)),
        "v1_feature_count": len(V1_FEATURE_COLS),
        "v2_feature_count": len(V2_FEATURE_COLS),
        "v2_added_features": [
            "river_discharge_m3s", "upstream_netravati_discharge_m3s",
            "river_discharge_ratio", "tide_level_max_m", "coastal_backwater_risk_index"
        ],
        "models_compared": {
            "baseline_logreg": base_metrics,
            "model_v1_rainfall_soil": v1_metrics,
            "model_v2_coastal_riverine": v2_metrics
        },
        "v2_feature_importances": v2_importances,
        "performance_by_flood_mechanism": mechanism_results,
        "key_takeaways": {
            "pr_auc_gain": round(v2_metrics["pr_auc"] - v1_metrics["pr_auc"], 4),
            "roc_auc_gain": round(v2_metrics["roc_auc"] - v1_metrics["roc_auc"], 4),
            "brier_improvement": round(v1_metrics["brier_score_loss"] - v2_metrics["brier_score_loss"], 4),
            "operational_recall_v1": v1_metrics["operational_threshold_0_03"]["recall"],
            "operational_recall_v2": v2_metrics["operational_threshold_0_03"]["recall"],
            "operational_precision_v1": v1_metrics["operational_threshold_0_03"]["precision"],
            "operational_precision_v2": v2_metrics["operational_threshold_0_03"]["precision"]
        }
    }
    
    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(COMPARISON_REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)
        
    # Save Model v2 artifact
    v2_artifact = {
        "model_version": "2.0.0",
        "model_name": "ResQNet Multi-Factor Coastal Intelligence Pipeline",
        "pipeline": calibrated_v2,
        "uncalibrated_pipeline": v2_pipeline_raw,
        "feature_names": V2_FEATURE_COLS,
        "trained_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "target_name": TARGET_COL,
        "metrics_summary": v2_metrics,
        "operational_thresholds": {
            "advisory_threshold": 0.03,
            "warning_threshold": 0.12
        },
        "supported_mechanisms": ["RIVERINE_OVERFLOW", "URBAN_PLUVIAL", "COASTAL_COMPOUND"],
        "locations_supported": [
            {"id": "mangaluru_urban", "name": "Mangaluru Urban (Kottara/Pumpwell)", "lat": 12.9141, "lon": 74.8560, "is_coastal": 1},
            {"id": "bantwal", "name": "Bantwal (Netravati Gauge)", "lat": 12.8942, "lon": 75.0345, "is_coastal": 0},
            {"id": "belthangady", "name": "Belthangady (Western Ghats Confluence)", "lat": 13.0033, "lon": 75.2974, "is_coastal": 0},
            {"id": "ullal", "name": "Ullal (Netravati Estuary)", "lat": 12.8055, "lon": 74.8529, "is_coastal": 1},
            {"id": "udupi", "name": "Udupi / Manipal (Swarna Basin)", "lat": 13.3409, "lon": 74.7421, "is_coastal": 1}
        ]
    }
    joblib.dump(v2_artifact, V2_ARTIFACT_PATH)
    print(f"\nModel v2 artifact saved to {V2_ARTIFACT_PATH}")
    print(f"Comparison report written to {COMPARISON_REPORT_PATH}")
    
    print("\n================== DEFENSIBLE MODEL COMPARISON (HELD-OUT 2023-2024 TEST SET) ==================")
    print(f"{'Metric':<30} | {'Model v1 (Rain+Soil)':<22} | {'Model v2 (Multi-Factor Coastal)':<25}")
    print("-" * 82)
    print(f"{'ROC-AUC':<30} | {v1_metrics['roc_auc']:<22} | {v2_metrics['roc_auc']:<25}")
    print(f"{'PR-AUC (Average Precision)':<30} | {v1_metrics['pr_auc']:<22} | {v2_metrics['pr_auc']:<25}")
    print(f"{'Brier Calibration Loss':<30} | {v1_metrics['brier_score_loss']:<22} | {v2_metrics['brier_score_loss']:<25}")
    print(f"{'Operational Recall (th=0.03)':<30} | {v1_metrics['operational_threshold_0_03']['recall']:<22} | {v2_metrics['operational_threshold_0_03']['recall']:<25}")
    print(f"{'Operational Precision (th=0.03)':<30} | {v1_metrics['operational_threshold_0_03']['precision']:<22} | {v2_metrics['operational_threshold_0_03']['precision']:<25}")
    print(f"{'Operational F1 Score':<30} | {v1_metrics['operational_threshold_0_03']['f1_score']:<22} | {v2_metrics['operational_threshold_0_03']['f1_score']:<25}")
    print(f"{'False Alarms (FP at 0.03)':<30} | {v1_metrics['operational_threshold_0_03']['false_positives']:<22} | {v2_metrics['operational_threshold_0_03']['false_positives']:<25}")
    print(f"{'Missed Floods (FN at 0.03)':<30} | {v1_metrics['operational_threshold_0_03']['false_negatives']:<22} | {v2_metrics['operational_threshold_0_03']['false_negatives']:<25}")
    print("=" * 82)
    print("\nTop 5 Drivers in Model v2:")
    for i, item in enumerate(v2_importances[:5], 1):
        print(f"  {i}. {item['feature']:<35} (MDI: {item['importance']:.4f})")
    print("\nPerformance by Flood Mechanism (v1 vs v2 Recall at 0.03):")
    for mech, res in mechanism_results.items():
        print(f"  • {mech:<22}: v1={res['v1_recall']*100:.1f}% -> v2={res['v2_recall']*100:.1f}% ({res['recall_gain_pct']:+.1f}% gain on {res['total_events']} events)")
        
    return report


if __name__ == "__main__":
    run_v2_training()
