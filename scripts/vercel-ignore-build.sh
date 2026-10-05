#!/bin/bash
# Vercel's "Ignored Build Step" (Settings → Git → Ignored Build Step →
# "Run this command" → `bash scripts/vercel-ignore-build.sh`).
#
# This repo's deploys are driven entirely by GitHub Actions
# (.github/workflows/deploy.yml) — migrations run BEFORE the app
# deploys, which Vercel's own git-push-triggered build can't guarantee
# (it has no way to wait for `prisma migrate deploy` to finish first).
# GitHub Actions calls `vercel deploy --prebuilt` itself once that's
# done, which creates its own Vercel deployment outside this trigger
# path entirely — so this script's only job is to make sure Vercel's
# OWN git-triggered build (for every push, to every branch) always
# gets skipped, never races the Actions-driven one.
#
# Exit 0 = skip the build. Exit 1 = proceed with the build. Always 0.
echo "Skipping Vercel's own git-triggered build — deploys run through GitHub Actions instead (see .github/workflows/deploy.yml)."
exit 0
