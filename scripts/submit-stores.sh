#!/usr/bin/env bash
# Submit the zips built by `npm run zip` / `npm run zip:firefox` to each
# store whose credentials are set. Pass --dry-run to only check credentials.
set -euo pipefail
shopt -s failglob

submitted=0

if [[ -n "${CHROME_REFRESH_TOKEN:-}" ]]; then
  npx wxt submit "$@" --chrome-zip .output/*-chrome.zip
  submitted=1
else
  echo "Chrome Web Store secrets not set; skipping."
fi

if [[ -n "${FIREFOX_JWT_SECRET:-}" ]]; then
  npx wxt submit "$@" --firefox-zip .output/*-firefox.zip --firefox-sources-zip .output/*-sources.zip
  submitted=1
else
  echo "Firefox Add-ons secrets not set; skipping."
fi

if [[ $submitted == 0 ]]; then
  echo "No store credentials configured; release published to GitHub only."
fi
