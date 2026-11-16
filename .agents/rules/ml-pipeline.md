---
trigger: glob
globs: backend/ml/**/*.py, backend/scripts/**/*.py
description: Rules for the Bhujal data preparation, training and inference code
---

# Bhujal ML pipeline rules

- Samples (`ml/features.py`): a well's next reading is predicted from its previous `WINDOW` readings. Inputs are the window rows (depth relative to the last depth, rainfall, temperature, month sin/cos, days since previous reading) plus the last depth, the days until the target reading and the target month (sin/cos). Keep `gap_days` at column index -3, because `train.py` filters on `X[:, -3]`.
- Target: the models learn the CHANGE from the last measured depth; predicted depth = last depth + predicted change, clipped at 0.
- Split: chronological per well type (`manual`, `telemetric`); the latest `--test-frac` (default 0.2) of each type's readings is the test set. Never shuffle across time.
- Leakage: fill missing values with past values (forward fill within a well) and training-period medians; fit `StandardScaler`s on training rows only.
- Always store the "repeat last reading" baseline next to model metrics, and per-type metrics in `test.by_type`.
- `train.py` writes `model_results`, `test_predictions` and `models_store/` (joblib files + `meta.json`); `infer.py` must use the same feature order from `meta.json`.
- Training and inference must stay CPU-only and finish in a few minutes on a laptop. TensorFlow is optional and used only by `ml/lstm.py`; everything else must work without it. No PyTorch.
- The LSTM gets exactly the same samples, split, scalers and baseline as the other models: the window part of each sample is reshaped to (window, n_features) for the LSTM layer; the last 4 columns (last depth, days ahead, next month sin/cos) go to the dense layers. Its early-stopping validation set is the latest 15% of the training period, never the test set.
- Never scale the target twice, and never fit a scaler on data that still contains the raw Kaggle outliers (±2,000 m).
- `prepare_kaggle_odisha.py`: manual wells (numeric ids) report positive depth and sensor wells (alphanumeric ids) report negative depth. Readings with the wrong sign are dropped, not flipped. Odisha membership comes from district polygons, never from the encoded state column.
