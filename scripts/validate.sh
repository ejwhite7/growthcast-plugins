#!/usr/bin/env bash
# Strict marketplace validation that tolerates the directory listing fields in plugin.json
# (documented, read by Anthropic's directory) when a Claude Code build doesn't know them yet.
set -uo pipefail
if command -v claude >/dev/null; then cli=(claude); else cli=(npx -y @anthropic-ai/claude-code); fi
out=$("${cli[@]}" plugin validate --strict . 2>&1)
status=$?
echo "$out"
[ $status -eq 0 ] && exit 0
other=$(echo "$out" | grep '❯' | grep -v -E "Unknown field '(documentationUrl|supportUrl|privacyPolicyUrl|termsOfServiceUrl)'")
if [ -z "$other" ] && echo "$out" | grep -q '❯'; then
	echo "Only directory listing fields were flagged; treating as passed."
	exit 0
fi
exit 1
