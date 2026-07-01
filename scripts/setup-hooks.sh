#!/bin/sh
# Run after cloning to enable pre-commit hooks.
git config core.hooksPath .githooks
echo "✅ Hooks configured at .githooks/"
