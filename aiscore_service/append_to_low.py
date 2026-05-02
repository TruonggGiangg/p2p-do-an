import os
import time

content = """
# ═══════════════════════════════════════════════════════════
# MAIN TRAINING PIPELINE (XGBOOST ONLY)
# ═══════════════════════════════════════════════════════════
def train_model():
    ts = time.time()
    print("\\n" + "═"*70)
    print("  XGBOOST ONLY TRAINING PIPELINE")
    print("  Full Data → ALL Features → XGBoost (Tuned HP + SPW)")
    print("  Resampling: SMOTE + RandomUnderSampler (imbalance handling)")
    print("═"*70)

    os.makedirs(MODEL_DIR, exist_ok=True)
    os.makedirs(CHART_DIR, exist_ok=True)

    # ── Step 1: Load & clean ──
    print(f"\\n[1/5] Loading and cleaning data...")
    df = load_and_clean_data(ACCEPTED_CSV, chart_dir=CHART_DIR)
    X = df[FEATURE_NAMES].values.astype(np.float64)
    y = df["is_default"].values.astype(np.int32)
    del df; gc.collect()

    # ── Step 2: Train/test split ──
    print(f"\\n[2/5] Train/test split (stratified)...")
    test_ratio = 0.2
    if MIN_TEST_SAMPLES and len(y) * test_ratio < MIN_TEST_SAMPLES:
        test_ratio = min(MIN_TEST_SAMPLES / len(y), 0.4)
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        X, y, test_size=test_ratio, stratify=y, random_state=RANDOM_STATE,
    )
    del X; gc.collect()
    print(f"  Train: {len(y_train):,} | Test: {len(y_test):,}")
    print(f"  Train default rate: {y_train.mean():.4f} | Test default rate: {y_test.mean():.4f}")

    # ── Step 2b: Resampling (TRAINING data only) ──
    smote_applied = False
    if USE_SMOTE and HAS_IMBLEARN:
        n_train = len(y_train)
        print(f"\\n[2b] Resampling training data (target minority ratio: {SMOTE_SAMPLING_STRATEGY})...")
        try:
            if n_train > SMOTE_MAX_SAMPLES:
                print(f"  Dataset > {SMOTE_MAX_SAMPLES:,} → Stage 1: RandomUnderSampler")
                rus = RandomUnderSampler(sampling_strategy=SMOTE_SAMPLING_STRATEGY, random_state=RANDOM_STATE)
                X_train_raw, y_train = rus.fit_resample(X_train_raw, y_train)
                
                minority_ratio = y_train.mean()
                target_ratio = SMOTE_TARGET_MINORITY / (1 - SMOTE_TARGET_MINORITY)
                if minority_ratio < SMOTE_TARGET_MINORITY:
                    print(f"  Stage 2: BorderlineSMOTE")
                    bsmote = BorderlineSMOTE(sampling_strategy=target_ratio, random_state=RANDOM_STATE, k_neighbors=5)
                    X_train_raw, y_train = bsmote.fit_resample(X_train_raw, y_train)
            else:
                print(f"  Stage 1: BorderlineSMOTE-Tomek")
                smote_tomek = SMOTETomek(
                    smote=BorderlineSMOTE(sampling_strategy=SMOTE_SAMPLING_STRATEGY, random_state=RANDOM_STATE, k_neighbors=5),
                    tomek=TomekLinks(sampling_strategy='majority'),
                    random_state=RANDOM_STATE,
                )
                X_train_raw, y_train = smote_tomek.fit_resample(X_train_raw, y_train)
            smote_applied = True
            print(f"  After resampling: {len(y_train):,} samples | default rate: {y_train.mean():.4f}")
        except Exception as e:
            print(f"  [WARN] Resampling failed: {e}. Continuing without resampling.")

    # ── Step 3: Per-feature smart scaling ──
    print(f"\\n[3/5] Per-feature smart scaling...")
    scalers, X_train_scaled = create_per_feature_scalers(X_train_raw, FEATURE_NAMES)
    X_test_scaled = apply_per_feature_scalers(X_test_raw, scalers, FEATURE_NAMES)
    scale_pos_wt = float(np.sum(y_train == 0) / np.sum(y_train == 1))
    print(f"  scale_pos_weight = {scale_pos_wt:.2f}")

    # ── Step 4: XGBoost ──
    print(f"\\n[4/5] Training XGBoost on ALL {len(FEATURE_NAMES)} scaled features...")
    best_xgb_params, tune_score = _tune_xgb(X_train_scaled, y_train, FEATURE_NAMES, scale_pos_wt)
    best_xgb_spw = best_xgb_params.get('scale_pos_weight', scale_pos_wt)
    print(f"  Best tune {THRESHOLD_METRIC}: {tune_score:.4f}")
    
    xgb_model = _build_xgb(scale_pos_wt, FEATURE_NAMES, tuned_params=best_xgb_params)
    _split = StratifiedKFold(n_splits=10, shuffle=True, random_state=RANDOM_STATE+999)
    _tr_idx, _val_idx = next(_split.split(X_train_scaled, y_train))
    xgb_model.fit(X_train_scaled[_tr_idx], y_train[_tr_idx],
                  eval_set=[(X_train_scaled[_val_idx], y_train[_val_idx])], verbose=False)
    
    xgb_train_proba = xgb_model.predict_proba(X_train_scaled)[:, 1]
    xgb_test_proba = xgb_model.predict_proba(X_test_scaled)[:, 1]
    
    # Isotonic calibration on train
    iso_calibrator = IsotonicRegression(out_of_bounds='clip', y_min=0.0, y_max=1.0)
    iso_calibrator.fit(xgb_train_proba, y_train)
    xgb_test_proba_calibrated = iso_calibrator.predict(xgb_test_proba)
    
    xgb_val_proba = xgb_model.predict_proba(X_train_scaled[_val_idx])[:, 1]
    optimal_threshold, opt_threshold_score = find_optimal_threshold(y_train[_val_idx], xgb_val_proba, metric=THRESHOLD_METRIC)
    print(f"  Optimal threshold: {optimal_threshold:.3f}")

    # ── Step 5: Save & Evaluate ──
    print(f"\\n[5/5] Evaluating and Saving...")
    preds = (xgb_test_proba >= optimal_threshold).astype(int)
    print(f"  Test Accuracy: {accuracy_score(y_test, preds):.4f}")
    print(f"  Test Precision: {precision_score(y_test, preds, zero_division=0):.4f}")
    print(f"  Test Recall: {recall_score(y_test, preds, zero_division=0):.4f}")
    print(f"  Test F1: {f1_score(y_test, preds, zero_division=0):.4f}")
    print(f"  Test AUC: {roc_auc_score(y_test, xgb_test_proba):.4f}")

    xgb_model.save_model(os.path.join(MODEL_DIR, "xgb_pd_model_low.json"))
    joblib.dump(scalers, os.path.join(MODEL_DIR, "per_feature_scalers_low.joblib"))
    joblib.dump(iso_calibrator, os.path.join(MODEL_DIR, "iso_calibrator_low.joblib"))

    elapsed = time.time() - ts
    print(f"\\n  DONE — Total time: {elapsed/60:.1f} min")
    
    return xgb_model

if __name__ == "__main__":
    train_model()
"""

with open('train_model_low.py', 'a', encoding='utf-8') as f:
    f.write(content)
