# Day57 Cloud Release Runbook

## Scope

This runbook releases the Day55 point/referral changes and Day57 refund reversal and database-backed admin RBAC changes. The backend, Admin web console, and WeChat Mini Program are separate release artifacts.

## Required Production Configuration

Set these values in the production secret store or `.env.production` before packaging the backend. Do not put real values in Git.

- `NODE_ENV=production`
- `SEED_ON_START=false`
- Strong `JWT_SECRET` and `REFRESH_TOKEN_PEPPER`, each at least 32 characters
- `MAP_PROVIDER=tencent` and `TENCENT_MAP_KEY`, or `MAP_PROVIDER=amap` and `AMAP_MAP_KEY`
- WeChat payment credentials, notification URLs, and both readable certificate files
- `WITHDRAW_PROVIDER=wechat` and `WECHAT_TRANSFER_SCENE_ID` when withdrawals are in production scope

`npm run release:preflight` is executed inside the candidate image by `deploy.sh`; it prints missing setting names only and never prints values.

## Backend Release

1. Review and commit the release source. Record the commit SHA in the release ticket.
2. From a machine that can reach the Node base-image registry, run `server\package-release.ps1 -Zip`. The output contains a tagged image tarball, `.image-tag`, and a release manifest.
3. Back up the production MySQL database and verify that the backup can be restored before changing the running service.
4. Transfer the release archive to a new directory on the server, extract it, and run `sh deploy.sh` from that directory.
5. `deploy.sh` validates production configuration, runs `prisma migrate deploy` before the switch, starts a candidate on port `3101`, waits for `/api/health`, then replaces the active container on port `3100`.
6. Confirm `npx prisma migrate status` reports 28 migrations, then run the point/referral and Admin role smoke checks against production test accounts.

The script retains the prior image ID during the switch and restores it if the new active container fails its health check. Database migrations are forward-only; image rollback does not revert data schema.

## Admin Web Release

1. Build the artifact with `admin\package-release.ps1 -Zip`.
2. Transfer and extract it on the server, then run `sh deploy.sh` from the extracted directory.
3. The script stages the bundle, atomically swaps `/www/wwwroot/life-assistant/admin-dist`, checks `https://www.xunhaoyou.com/admin/`, and retains the preceding bundle directory for rollback.

## Mini Program Release

1. Build the artifact with `miniapp\package-release.ps1 -Zip`.
2. Import `miniapp-dist` in WeChat Mini Program DevTools and run the real-device payment, address, referral, points, and member-card scenarios.
3. Upload the verified package and submit it through the approved WeChat release process. This step is intentionally not automated because it requires the authorized Mini Program upload credential and review decision.

## Post-Release Checks

- Public `/api/health` and Admin `/admin/` return successfully.
- A completed paid test order accrues spend points at the configured rule rate.
- A partial refund followed by another partial refund reverses only the cumulative proportional points.
- A referral first-consumption reward follows the published rule version and reverses correctly on refunds.
- `super_admin`, `operator`, and `finance` roles have expected access; generic order mutation cannot update a service booking.
- Address search/autofill works with the configured map provider.
