"""NumPy-only copies of the trained scikit-learn models, so the deployed API can predict without
scikit-learn/scipy (they don't fit in a Vercel serverless function).

    python -m ml.portable        # writes models_store/portable.npz from the trained .joblib files

`ml.train` calls `export()` automatically after training. `ml.infer` uses portable.npz when it exists.
"""
import os

import numpy as np

PORTABLE_FILE = "portable.npz"
_KEYS = {"Linear Regression": "lin", "Random Forest": "rf", "Gradient Boosting": "gb", "MLP Neural Network": "mlp"}


# ---------------------------------------------------------------- export (needs scikit-learn)
def _pack_trees(trees, prefix, out):
    """trees: list of (left, right, feature, threshold, value, missing_left). Concatenated with offsets."""
    offs = np.cumsum([0] + [len(t[0]) for t in trees])
    for i, name in enumerate(("left", "right", "feat", "thr", "val", "nanleft")):
        parts = []
        for k, t in enumerate(trees):
            a = np.asarray(t[i])
            if name in ("left", "right"):
                a = np.where(a >= 0, a + offs[k], -1)  # global node index, -1 = leaf
            parts.append(a)
        dtype = {"left": np.int32, "right": np.int32, "feat": np.int32, "thr": np.float64,
                 "val": np.float64, "nanleft": np.bool_}[name]
        out[f"{prefix}_{name}"] = np.concatenate(parts).astype(dtype)
    out[f"{prefix}_roots"] = offs[:-1].astype(np.int32)


def export(model_dir):
    import joblib

    from ml.features import MODEL_FILES

    sc = joblib.load(os.path.join(model_dir, "scalers.joblib"))
    out = {"x_mean": sc["x"].mean_, "x_scale": sc["x"].scale_, "y_mean": sc["y"].mean_, "y_scale": sc["y"].scale_}

    def load(name):
        p = os.path.join(model_dir, MODEL_FILES[name])
        return joblib.load(p) if os.path.exists(p) else None

    if (m := load("Linear Regression")) is not None:
        out["lin_coef"], out["lin_b"] = np.ravel(m.coef_), np.ravel(m.intercept_)

    if (m := load("MLP Neural Network")) is not None:
        if m.activation != "relu":
            raise ValueError("portable export supports relu MLPs only")
        out["mlp_layers"] = np.array(len(m.coefs_))
        for i, (w, b) in enumerate(zip(m.coefs_, m.intercepts_)):
            out[f"mlp_w{i}"], out[f"mlp_b{i}"] = w, b

    if (m := load("Random Forest")) is not None:
        trees = []
        for est in m.estimators_:
            t = est.tree_
            trees.append((t.children_left, t.children_right, t.feature, t.threshold, t.value[:, 0, 0],
                          np.zeros(t.node_count, bool)))
        _pack_trees(trees, "rf", out)

    if (m := load("Gradient Boosting")) is not None:
        trees = []
        for (pred,) in m._predictors:
            n = pred.nodes
            if n["is_categorical"].any():
                raise ValueError("portable export does not support categorical splits")
            leaf = n["is_leaf"].astype(bool)
            trees.append((np.where(leaf, -1, n["left"].astype(np.int64)),
                          np.where(leaf, -1, n["right"].astype(np.int64)), n["feature_idx"],
                          n["num_threshold"], n["value"], n["missing_go_to_left"].astype(bool)))
        _pack_trees(trees, "gb", out)
        out["gb_base"] = np.ravel(m._baseline_prediction).astype(np.float64)

    path = os.path.join(model_dir, PORTABLE_FILE)
    np.savez_compressed(path, **out)
    return path


# ---------------------------------------------------------------- inference (NumPy only)
class _Scaler:
    def __init__(self, mean, scale):
        self.mean, self.scale = mean, scale

    def transform(self, x):
        return (np.asarray(x, dtype=np.float64) - self.mean) / self.scale

    def inverse_transform(self, x):
        return np.asarray(x, dtype=np.float64) * self.scale + self.mean


class _Trees:
    def __init__(self, z, prefix, combine, base=0.0, float32_inputs=False):
        self.left, self.right = z[f"{prefix}_left"], z[f"{prefix}_right"]
        self.feat, self.thr, self.val = z[f"{prefix}_feat"], z[f"{prefix}_thr"], z[f"{prefix}_val"]
        self.nanleft, self.roots = z[f"{prefix}_nanleft"], z[f"{prefix}_roots"]
        self.combine, self.base, self.float32_inputs = combine, base, float32_inputs

    def predict(self, X):
        # scikit-learn's RandomForest rounds inputs to float32 before comparing them with the thresholds
        X = np.asarray(X, dtype=np.float32 if self.float32_inputs else np.float64).astype(np.float64)
        n, T = len(X), len(self.roots)
        rows = np.repeat(np.arange(n), T)
        node = np.tile(self.roots, n)
        active = self.left[node] >= 0
        while active.any():
            idx = np.nonzero(active)[0]
            nd = node[idx]
            x = X[rows[idx], self.feat[nd]]
            go_left = np.where(np.isnan(x), self.nanleft[nd], x <= self.thr[nd])
            node[idx] = np.where(go_left, self.left[nd], self.right[nd])
            active[idx] = self.left[node[idx]] >= 0
        leaf = self.val[node].reshape(n, T)
        return self.base + (leaf.mean(axis=1) if self.combine == "mean" else leaf.sum(axis=1))


class _Linear:
    def __init__(self, z):
        self.coef, self.b = z["lin_coef"], z["lin_b"]

    def predict(self, X):
        return np.asarray(X, dtype=np.float64) @ self.coef + self.b[0]


class _MLP:
    def __init__(self, z):
        k = int(z["mlp_layers"])
        self.layers = [(z[f"mlp_w{i}"], z[f"mlp_b{i}"]) for i in range(k)]

    def predict(self, X):
        h = np.asarray(X, dtype=np.float64)
        for i, (w, b) in enumerate(self.layers):
            h = h @ w + b
            if i < len(self.layers) - 1:
                h = np.maximum(h, 0)
        return h.ravel()


def load(model_dir):
    """Returns (scalers dict, {model name: predictor}) or None when portable.npz is missing."""
    path = os.path.join(model_dir, PORTABLE_FILE)
    if not os.path.exists(path):
        return None
    with np.load(path) as f:
        z = {k: f[k] for k in f.files}
    scalers = {"x": _Scaler(z["x_mean"], z["x_scale"]), "y": _Scaler(z["y_mean"], z["y_scale"])}
    models = {}
    if "lin_coef" in z:
        models["Linear Regression"] = _Linear(z)
    if "mlp_layers" in z:
        models["MLP Neural Network"] = _MLP(z)
    if "rf_roots" in z:
        models["Random Forest"] = _Trees(z, "rf", "mean", float32_inputs=True)
    if "gb_roots" in z:
        models["Gradient Boosting"] = _Trees(z, "gb", "sum", base=float(z["gb_base"][0]))
    return scalers, models


if __name__ == "__main__":
    from app.config import MODEL_DIR

    print("Wrote", export(MODEL_DIR))
