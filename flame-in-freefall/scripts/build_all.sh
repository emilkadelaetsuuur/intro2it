#!/usr/bin/env bash
# SI notice: written with SI (AI) assistance (Claude, Anthropic).
# Rebuild everything the page shows from the raw NASA files, then run the checks.
# The video step needs the BASS-II videos; pass their folder as the first argument to rerun it.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" != "" ]; then python3 video/run_all.py "$1"; fi
python3 scripts/train_model.py
python3 scripts/build_data.py
python3 -m unittest discover -s tests
