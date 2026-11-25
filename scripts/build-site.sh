#!/usr/bin/env bash
# Builds the GitHub Pages site:  /      = dancer portal + phone viewer (src/viewer)
#                                 /app/  = the StageFlow editor for the web (src)
# A cloud.config.json in the repo root (project URL + publishable key) is copied next to both,
# so the web app and dancer links connect to your StageFlow Cloud by themselves.
set -euo pipefail
out="${1:-_site}"
rm -rf "$out"
mkdir -p "$out/app"
cp -R src/viewer/. "$out/"
cp -R src/. "$out/app/"
# the web app downloads the motion-capture models from Google's model storage (see src/choreo.js)
rm -f "$out"/app/vendor/mediapipe/*.task
if [ -f cloud.config.json ]; then cp cloud.config.json "$out/cloud.config.json"; cp cloud.config.json "$out/app/cloud.config.json"; fi
touch "$out/.nojekyll"
echo "Built $out ($(du -sh "$out" | cut -f1))"
