#!/bin/sh
# Print the name of the git remote that points to the repository in
# package.json#repository.url. scripts/release.sh pushes the release there.
#
# A fixed remote name is not safe: in a clone of the fork, `origin` may be the
# upstream project, and a release pushed there lands in the wrong repository.
#
# Run it from the repository root. Exits non-zero unless exactly one remote
# matches.
set -eu

# Reduce a git url to host/owner/repo in lower case, so https and ssh urls,
# with or without .git, compare equal.
normalize() {
  printf '%s\n' "$1" | sed \
    -e 's#^git+##' \
    -e 's#^[a-z+]*://##' \
    -e 's#^[^@/]*@##' \
    -e 's#:#/#' \
    -e 's#\.git$##' \
    -e 's#/*$##' | tr '[:upper:]' '[:lower:]'
}

repository="$(normalize "$(node -p "require('./package.json').repository.url")")"

matches=""
for remote in $(git remote); do
  if [ "$(normalize "$(git remote get-url "$remote")")" = "$repository" ]; then
    matches="${matches:+$matches }$remote"
  fi
done

case "$matches" in
  "")
    echo "release: no git remote points to $repository (package.json#repository); add one with git remote add" >&2
    exit 1
    ;;
  *" "*)
    echo "release: several git remotes point to $repository: $matches; remove all but one" >&2
    exit 1
    ;;
esac

echo "$matches"
