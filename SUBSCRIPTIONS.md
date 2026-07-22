# Couple subscription rollout

The purchaser owns one RevenueCat-backed `Subscription`. Their currently linked
partner receives access dynamically; no subscription is copied or transferred.

## Required configuration

Set these server environment variables before enabling the new routes:

- `REVENUECAT_WEBHOOK_SECRET`: exact Authorization header configured in RevenueCat.
- `REVENUECAT_V1_SECRET_API_KEY`: RevenueCat v1 secret key used only by the backend.
- `REVENUECAT_PREMIUM_ENTITLEMENT_ID`: the exact premium entitlement identifier.
- `REVENUECAT_ALLOW_SANDBOX=false` in production.

Point the RevenueCat webhook to `POST /api/webhooks/revenuecat`.

## Safe deployment order

1. Deploy the backend and configure the environment variables.
2. Send a RevenueCat test webhook and confirm it returns HTTP 200.
3. Run `npm run test:subscriptions`.
4. Run `npm run subscriptions:migrate` (dry-run only).
5. Review the counts, then run `npm run subscriptions:migrate:apply`.
6. Deploy the updated mobile app.
7. Schedule `npm run subscriptions:reconcile -- --limit=200` at least daily.

Legacy `User.premiumExpiresAt` access remains valid when no canonical
`Subscription` exists. Migrated legacy records remain active until their stored
expiration while verification is pending. A verified canonical record then takes
precedence, preventing stale legacy fields from restoring expired access.

Do not remove the legacy premium fields until migrated records and webhook
delivery have been monitored successfully for at least one complete billing
cycle.
