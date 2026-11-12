#!/usr/bin/env bash
# Полная сборка серии:  tools/build.sh ep01
#   1) озвучка и таймлайн   2) кадры   3) звук   4) склейка в mp4
set -euo pipefail
EP="${1:-ep01}"
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"

"$PY" tools/tts.py "episodes/$EP"
rm -rf "build/$EP/frames"
node tools/render.js "$EP" --workers "${WORKERS:-4}"
"$PY" tools/audio.py "episodes/$EP"
mkdir -p out
ffmpeg -y -v warning -framerate 30 -i "build/$EP/frames/f_%06d.jpg" -i "build/$EP/mix.wav" \
  -vf "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p" \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:v libx264 -preset slow -crf 19 -profile:v high -tune animation -r 30 \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11" -ar 48000 -c:a aac -b:a 192k \
  -movflags +faststart -shortest "out/$EP.mp4"
echo "Готово: out/$EP.mp4"
