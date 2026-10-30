#!/usr/bin/env bash
# Download the CC0 photo textures + sky HDRI used by Realistic graphics mode
# from Poly Haven (https://polyhaven.com, CC0 — no attribution required).
# Files land in public/assets/ph/ (gitignored). Safe to re-run; existing files are skipped.
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)/public/assets/ph"
base="https://dl.polyhaven.org/file/ph-assets"
mkdir -p "$dir"

fetch() { # url dest
  if [ -s "$2" ]; then echo "have  $(basename "$2")"; return; fi
  curl -fsSL "$1" -o "$2.part" && mv "$2.part" "$2" && echo "got   $(basename "$2")"
}

for tex in aerial_grass_rock rocky_terrain_02 bark_brown_02 weathered_planks castle_brick_07 metal_plate; do
  for map in diff nor_gl rough; do
    fetch "$base/Textures/jpg/2k/$tex/${tex}_${map}_2k.jpg" "$dir/${tex}_${map}.jpg"
  done
done
fetch "$base/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr" "$dir/sky.hdr"
echo "done -> $dir"
