#!/bin/sh
# Print the image tags for a released version, one per line.
#
# Usage: scripts/image-tags.sh <version>     e.g. 4.1.0
#
# A release gets its exact version plus the floating tags MAJOR.MINOR, MAJOR
# and latest, so users can follow a line of releases. A prerelease
# (4.1.0-rc.1) gets only its exact version, so it never replaces a release.
set -eu

version="${1:?usage: $0 <version>}"

if ! printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
  echo "image-tags: not a semver version: $version" >&2
  exit 1
fi

echo "$version"
case "$version" in
  *-*) exit 0 ;;
esac

major="${version%%.*}"
minor="${version#*.}"
minor="${minor%%.*}"
echo "$major.$minor"
echo "$major"
echo latest
