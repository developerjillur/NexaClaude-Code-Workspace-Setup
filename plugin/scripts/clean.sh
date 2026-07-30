#!/bin/sh
# This drive is exFAT, so macOS writes an AppleDouble `._name` beside every file. They are
# not content, they confuse every count and listing, and they come back on each write.
# Run before committing.
find . -name '._*' -delete
find . -name '.DS_Store' -delete
echo "  ✅ AppleDouble files removed ($(find . -name '._*' | wc -l | tr -d ' ') remaining)"
