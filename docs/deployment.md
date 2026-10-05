# Deployment pipeline

Two branches, two environments, both driven by GitHub Actions
(`.github/workflows/deploy.yml`), never by Vercel's own git-push
auto-deploy:

- `staging` → Vercel Preview environment (staging DB)
- `main` → Vercel Production environment (production DB)

Every deploy runs migrations **before** the app ships, so a bad
migration never leaves a deployed app pointed at a schema it doesn't
match. Vercel's own git-triggered build can't guarantee that ordering
on its own — it has no way to wait for `prisma migrate deploy` first —
so that path has to be disabled, not just the two deploys reconciled
after the fact.

## One-time manual setup (Vercel dashboard)

`vercel.json`'s `git.deploymentEnabled: { main: false, staging: false }`
is **not sufficient on its own** to stop Vercel's own auto-deploy for a
project connected via the GitHub App integration — the dashboard's own
Git settings take priority for the actual build trigger. The reliable
way to disable it is **Ignored Build Step**:

1. Vercel project → Settings → Git → "Ignored Build Step"
2. Choose "Run this command"
3. Enter: `bash scripts/vercel-ignore-build.sh`
4. Save

That script always exits 0 (skip), for every branch, every push — so
Vercel never builds or deploys on its own. The only deploys that ever
happen are the explicit `vercel deploy --prebuilt` calls inside
`deploy.yml`'s `deploy-staging`/`deploy-production` jobs, which run
after migrations succeed.

## Verifying it worked

After setting Ignored Build Step, push a trivial commit to `staging`
or `main` and check:

- GitHub → Actions tab: the `deploy-staging`/`deploy-production` job
  runs and succeeds.
- Vercel → Deployments: the new deployment's source should show it was
  created via the Vercel CLI/API (from `vercel deploy`), and there
  should be **no additional, separate deployment** for the same commit
  that Vercel triggered on its own — if the Ignored Build Step is
  working, you'll only ever see one deployment per push, not two.
