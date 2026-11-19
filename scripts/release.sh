#!/bin/sh
# Cut a release: update CHANGELOG.md, bump the version, commit, tag vX.Y.Z
# and push the branch together with the tag.
#
# Usage: scripts/release.sh major|minor|patch
# Run it through yarn (yarn release:<bump>) so the changelog binary is on PATH.
set -eu

bump="${1:-}"
case "$bump" in
  major) changelog_flag=-M ;;
  minor) changelog_flag=-m ;;
  patch) changelog_flag=-p ;;
  *)
    echo "usage: $0 major|minor|patch" >&2
    exit 1
    ;;
esac

if [ -n "$(git status --porcelain)" ]; then
  echo "release: working tree is not clean, commit or stash first" >&2
  exit 1
fi

# generate-changelog derives the next version from package.json and the
# commits since the latest tag, so it has to run before the version bump.
changelog "$changelog_flag"
git add CHANGELOG.md
git commit -m 'docs: updated CHANGELOG.md'

# yarn 4's `yarn version` only rewrites package.json (and the workspace entry
# in yarn.lock); it neither commits nor tags.
yarn version "$bump"
version="$(node -p "require('./package.json').version")"
tag="v$version"

git commit -a -m "$tag"
git tag -a "$tag" -m "$tag"

git push --atomic origin HEAD "refs/tags/$tag"
