#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

"$ROOT/python/.venv/bin/python" "$ROOT/python/export_mlp_weights.py"

# shellcheck source=/dev/null
. "$ROOT/opencv-build/emsdk/emsdk_env.sh" >/dev/null

emcc "$ROOT/p5/wasm/gelsight_mlp.c" \
  -O3 \
  -msimd128 \
  -ffast-math \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=GelSightMlpWasm \
  -sENVIRONMENT=web \
  -sALLOW_MEMORY_GROWTH=1 \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_mlp_get_weight_count","_mlp_load","_mlp_load_f16","_mlp_run","_mlp_run_gradients","_mlp_run_gradients_unchecked"]' \
  -o "$ROOT/p5/wasm/gelsight_mlp.js"
