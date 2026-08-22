#!/usr/bin/env bash
#
# Prepare a captured model for publishing.
#
# A raw scan or an architectural export is tens of megabytes of uncompressed
# geometry and full-size textures. That will not upload — .glb is stored as a
# raw file and raw files are capped low — and it would not be usable on Kenyan
# mobile data even if it did.
#
# Draco compresses the geometry, WebP the textures. On a real 45 MB tower this
# produced 3.7 MB with no visible difference.
#
#   ./scripts/optimise-glb.sh input.glb [output.glb]
#
set -euo pipefail

IN="${1:?usage: optimise-glb.sh input.glb [output.glb]}"
OUT="${2:-${IN%.glb}-web.glb}"

[ -f "$IN" ] || { echo "No such file: $IN" >&2; exit 1; }

before=$(du -m "$IN" | cut -f1)

npx --yes @gltf-transform/cli@latest optimize "$IN" "$OUT" \
  --compress draco \
  --texture-compress webp

after=$(du -m "$OUT" | cut -f1)

echo
echo "  $IN: ${before} MB  →  $OUT: ${after} MB"

if [ "$after" -gt 10 ]; then
  echo
  echo "  Still over the 10 MB limit. The textures are usually what is left —"
  echo "  try --texture-size 1024 to halve them, or simplify the mesh:"
  echo "    npx @gltf-transform/cli simplify \"$OUT\" \"$OUT\" --ratio 0.5 --error 0.001"
fi
