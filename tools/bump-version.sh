#!/bin/sh
# Usage: ./tools/bump-version.sh 1.0.1   (or no argument to bump the last number)
# Updates VERSION in js/config.js and version.json together. Run before every deploy.
cd "$(dirname "$0")/.." || exit 1
cur=$(sed -n "s/^const VERSION = '\(.*\)';/\1/p" js/config.js)
new="$1"
if [ -z "$new" ]; then new=$(echo "$cur" | awk -F. '{ $NF = $NF + 1; print }' OFS=.); fi
sed -i '' "s/^const VERSION = '.*';/const VERSION = '$new';/" js/config.js
printf '{ "version": "%s" }\n' "$new" > version.json
echo "VERSION $cur -> $new"
