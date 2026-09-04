#!/bin/bash
# Rebuilds the site from whatever is in photos-src/ and publishes it.
set -e
cd "$HOME/Documents/iBuilt/filmstrip"

count=$(ls photos-src/*.jpg photos-src/*.jpeg photos-src/*.png photos-src/*.tif photos-src/*.tiff 2>/dev/null | wc -l | tr -d ' ')
if [ "$count" -eq 0 ]; then
  echo "No photos found in photos-src/."
  echo "Drag some in first, then run this again. Nothing was changed."
  exit 1
fi
echo "Found $count photo(s). Building..."
echo

npm run photos

echo
git add -A
git commit -q -m "Update photos" || { echo "Nothing changed since last time."; exit 0; }
git push -q origin main
echo
echo "Published. Live in about 30 seconds:"
echo "  https://filmstrip-ten.vercel.app"
