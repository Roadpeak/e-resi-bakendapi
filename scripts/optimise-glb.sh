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
# Order matters if a model also needs simplifying: simplify the ORIGINAL first,
# then run this. Simplifying an already-compressed file decompresses it, and a
# 13 MB output came back out at 41 MB.
#
#   ./scripts/optimise-glb.sh input.glb [output.glb]
#
set -euo pipefail

IN="${1:?usage: optimise-glb.sh input.glb [output.glb]}"
OUT="${2:-${IN%.glb}-web.glb}"
# Matches RAW_UPLOAD_LIMIT_MB on the API.
LIMIT_MB="${RAW_UPLOAD_LIMIT_MB:-50}"

[ -f "$IN" ] || { echo "No such file: $IN" >&2; exit 1; }

before=$(du -m "$IN" | cut -f1)

npx --yes @gltf-transform/cli@latest optimize "$IN" "$OUT" \
  --compress draco \
  --texture-compress webp

after=$(du -m "$OUT" | cut -f1)

echo
echo "  $IN: ${before} MB  →  $OUT: ${after} MB"

if [ "$after" -gt "$LIMIT_MB" ]; then
  echo
  echo "  Still over the ${LIMIT_MB} MB limit. Simplify BEFORE compressing —"
  echo "  running simplify on this output decompresses it and it grows:"
  echo
  echo "    npx @gltf-transform/cli simplify \"$IN\" /tmp/s.glb --ratio 0.3 --error 0.001"
  echo "    $0 /tmp/s.glb \"$OUT\""
fi

# Triangles matter as much as bytes: a small file that is dense still stutters
# on a phone. There is no CLI reporting for this, so it is worth checking the
# count the upload reports and simplifying if it is above 400k.
