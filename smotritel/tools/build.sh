#!/usr/bin/env bash
# Полная сборка серии:  tools/build.sh ep01
#   1) озвучка и таймлайн   2) кадры   3) звук   4) склейка в mp4
set -euo pipefail
EP="${1:-ep01}"
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"

SKIP=" ${SKIP:-} "    # пропуск шагов: SKIP="tts render" tools/build.sh ep01
[[ "$SKIP" == *" tts "* ]]    || "$PY" tools/tts.py "episodes/$EP"
[[ "$SKIP" == *" render "* ]] || { rm -rf "build/$EP/frames"; node tools/render.js "$EP" --workers "${WORKERS:-4}"; }
[[ "$SKIP" == *" audio "* ]]  || "$PY" tools/audio.py "episodes/$EP"
mkdir -p out
# громкость: меряем микс и поднимаем до -14 LUFS одним усилением + лимитер (баланс голос/музыка не меняется)
LUFS=$(ffmpeg -hide_banner -nostats -i "build/$EP/mix.wav" -af ebur128 -f null - 2>&1 | awk '/Integrated loudness:/{f=1} f && /I:/{print $2; exit}')
GAIN=$(awk -v l="$LUFS" 'BEGIN{printf "%.2f", -14 - l}')
echo "Громкость микса: $LUFS LUFS, усиление: $GAIN dB"
ffmpeg -y -v warning -thread_queue_size 64 -framerate 30 -i "build/$EP/frames/f_%06d.jpg" -i "build/$EP/mix.wav" \
  -vf "scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p" \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:v libx264 -preset slow -crf "${CRF:-20}" -profile:v high -tune animation -r 30 \
  -af "volume=${GAIN}dB,alimiter=limit=0.8:attack=3:release=80:level=false" -ar 48000 -c:a aac -b:a 192k \
  -movflags +faststart -shortest "out/$EP.mp4"
echo "Готово: out/$EP.mp4"
