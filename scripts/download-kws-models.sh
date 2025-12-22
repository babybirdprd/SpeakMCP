#!/bin/bash
set -e

MODEL_DIR="apps/desktop/resources/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01"
mkdir -p "$MODEL_DIR"

BASE_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2"

echo "Downloading model from $BASE_URL..."
curl -L -o model.tar.bz2 "$BASE_URL"

echo "Extracting model..."
tar -xvf model.tar.bz2 -C apps/desktop/resources/kws-models/

echo "Cleaning up..."
rm model.tar.bz2

echo "Done."
