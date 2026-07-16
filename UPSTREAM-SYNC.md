# Upstream sync runbook

Fork: `github.com/Angioz/ChatbotX`  
Working branch: `ultra/main`  
Pinned base: upstream `40faa5ba0451891b32fa2adf0aa29a0af5dadfa1` (current VPS base)

## One-time remote setup

Check the remotes:

```bash
git remote -v
```

If `upstream` is missing, add the original repository, then verify it. Do not change `origin`:

```bash
git remote add upstream https://github.com/ChatbotXIO/ChatbotX.git
git remote -v
```

## Monthly sync: first Monday

Preconditions: the `ultra/main` worktree is clean and its CI is green.

```bash
git switch ultra/main
git status --short
git fetch upstream
date=$(date +%F)
git switch -c "sync/upstream-$date" ultra/main
git merge --no-ff upstream/main
```

Resolve merge conflicts under the additive-only doctrine:

- Fork work is new files, new features/meta, and new `packages/business` services.
- Existing upstream files receive only minimal-line changes.
- Expected conflicts may touch only `apps/builder/docker/Dockerfile`, `apps/builder/src/proxy.ts`, and `apps/builder/src/routers/public.ts`.
- A conflict anywhere else is a doctrine violation: stop and investigate before continuing.

After resolving expected conflicts:

```bash
git add <resolved-file-1> <resolved-file-2>
git commit
pnpm install
pnpm check-types
pnpm --filter worker test
git push -u origin "sync/upstream-$date"
```

Open the sync PR. Merge it into `ultra/main` only after CI has successfully built all four images:

- `ghcr.io/angioz/chatbotx-builder`
- `ghcr.io/angioz/chatbotx-worker`
- `ghcr.io/angioz/chatbotx-realtime`
- `ghcr.io/angioz/chatbotx-mcp`

Each release must publish tags `ultra` and `ultra-<sha7>` for every image.

## Post-deploy verification

The VPS pulls images only; it must never build them. After deployment:

```bash
curl -fsS https://<deployment-host>/api/v1/meta/version
```

`GET /api/v1/meta/version` must return the new fork commit SHA. Treat any other SHA as a failed deployment.

## Rollback

Choose the previous known-good `ultra-<sha7>` tag and pin that same tag for builder, worker, realtime, and MCP in the VPS Compose file. Do not rebuild or use an unversioned rollback tag.

```bash
# In the VPS Compose file, set all four image tags to ultra-<previous-sha7>.
docker compose pull
docker compose up -d
curl -fsS https://<deployment-host>/api/v1/meta/version
```

Confirm the endpoint returns the previous full fork SHA.

## Divergence register

Every fork-owned addition or upstream-file modification must be registered here in the same task that introduces it. Keep existing-file changes minimal and append rows; do not rewrite history.

| File | Kind | Fork purpose / allowed delta |
| --- | --- | --- |
| `.github/workflows/ultra-release.yml` | New | Build and publish the four fork images with `ultra` and immutable `ultra-<sha7>` tags. |
| `UPSTREAM-SYNC.md` | New | Operational upstream-sync, verification, and rollback runbook. |
| `apps/builder/docker/Dockerfile` | Minimal touch | Fork release build arguments and environment wiring only. |
| `apps/builder/src/proxy.ts` | Minimal touch | Register fork-owned public routes only. |
| `apps/builder/src/routers/public.ts` | Minimal touch | Spread fork-owned public routers only. |

## Node engine

The repository requires Node.js `>=24`. Local development on Node 22 has two known timeouts in `packages/ai`; they are environment-shaped, not code bugs. CI on Node 24 is authoritative.
