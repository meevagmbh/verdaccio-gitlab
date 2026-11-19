#!/bin/sh
# Cut a release: bump the version, prepend the release notes to CHANGELOG.md,
# commit both, tag vX.Y.Z and push the branch together with the tag.
#
# Usage: scripts/release.sh major|minor|patch
# Run it through yarn (yarn release:<bump>) so the conventional-changelog
# binary is on PATH.
set -eu

bump="${1:-}"
case "$bump" in
  major | minor | patch) ;;
  *)
    echo "usage: $0 major|minor|patch" >&2
    exit 1
    ;;
esac

if [ -n "$(git status --porcelain)" ]; then
  echo "release: working tree is not clean, commit or stash first" >&2
  exit 1
fi

# Undo the version bump and the changelog update if a step before the commit
# fails, so a failed release leaves the working tree clean again.
committed=false
restore() {
  if [ "$committed" = false ]; then
    git checkout -- package.json CHANGELOG.md
  fi
}
trap restore EXIT

# yarn 4's `yarn version` only rewrites package.json; it neither commits nor
# tags.
yarn version "$bump"
version="$(node -p "require('./package.json').version")"
tag="v$version"

# conventional-changelog titles the new section with the version from
# package.json and collects the commits since the latest vX.Y.Z tag, so it has
# to run after the bump and before the tag. Older entries stay below it.
conventional-changelog --preset conventionalcommits --infile CHANGELOG.md --release-count 1

git add package.json CHANGELOG.md
git commit -m "chore(release): $tag"
committed=true
git tag -a "$tag" -m "$tag"

git push --atomic origin HEAD "refs/tags/$tag"
