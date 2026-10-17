# Model setup

## Default: free (no GPU)

FrankGPT works with **no GPU** and **no model download**.

1. Open the web app.
2. Choose duration: **10s**, **20s**, or **30s**.
3. Generate — the browser creates the clip.

```
MODEL_PROVIDER=free
MODEL_ID=free-browser
```

## Optional: local GPU model

Only if you install a local video model later:

1. Download weights outside the repo.
2. Set `MODEL_DIR`.
3. Enable the model in `model_configs/`.
4. Set `MODEL_PROVIDER=local`.

The free path remains the default.
