"""Optional LSTM model (needs TensorFlow; CPU is enough).

It takes the same samples as the other four models (see ml/features.py), so its results are directly comparable:
  * the window part of each sample is fed to the LSTM as a sequence of `window` time steps x `n_feat` features;
  * the last depth, days until the next reading and the next month go straight to the dense layers;
  * it predicts the change from the last reading, in the same scaled units as the other models.
"""
import numpy as np


def available():
    try:
        import tensorflow  # noqa: F401
        return True
    except ImportError:
        return False


class LSTMRegressor:
    def __init__(self, window, n_feat, units=32, epochs=80, batch_size=64, seed=42):
        self.window, self.n_feat = window, n_feat
        self.units, self.epochs, self.batch_size, self.seed = units, epochs, batch_size, seed
        self.model = None

    def _split(self, X):
        X = np.asarray(X, dtype="float32")
        k = self.window * self.n_feat
        return X[:, :k].reshape(-1, self.window, self.n_feat), X[:, k:]

    def _build(self, n_extra):
        from tensorflow import keras
        L = keras.layers
        seq_in = keras.Input(shape=(self.window, self.n_feat), name="history")
        extra_in = keras.Input(shape=(n_extra,), name="next_step")
        h = L.LSTM(self.units)(seq_in)
        h = L.Dropout(0.2)(h)
        h = L.Concatenate()([h, extra_in])
        h = L.Dense(32, activation="relu")(h)
        out = L.Dense(1)(h)
        model = keras.Model([seq_in, extra_in], out)
        model.compile(optimizer=keras.optimizers.Adam(1e-3), loss="mse")
        return model

    def fit(self, X, y, dates=None):
        import tensorflow as tf
        from tensorflow import keras
        tf.keras.utils.set_random_seed(self.seed)
        seq, extra = self._split(X)
        y = np.asarray(y, dtype="float32")
        # validation = the latest 15% of the training period (chronological, never the test set)
        order = np.argsort(dates) if dates is not None else np.arange(len(y))
        n_val = max(1, int(0.15 * len(y)))
        tr_i, va_i = order[:-n_val], order[-n_val:]
        self.model = self._build(extra.shape[1])
        self.model.fit([seq[tr_i], extra[tr_i]], y[tr_i],
                       validation_data=([seq[va_i], extra[va_i]], y[va_i]),
                       epochs=self.epochs, batch_size=self.batch_size, verbose=0,
                       callbacks=[keras.callbacks.EarlyStopping(patience=8, restore_best_weights=True)])
        return self

    def predict(self, X):
        seq, extra = self._split(X)
        return self.model.predict([seq, extra], verbose=0).ravel()

    def save(self, path):
        self.model.save(path)

    @classmethod
    def load(cls, path, window, n_feat):
        from tensorflow import keras
        obj = cls(window, n_feat)
        obj.model = keras.models.load_model(path)
        return obj
