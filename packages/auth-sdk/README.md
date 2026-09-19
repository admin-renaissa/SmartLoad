# `@renverse/auth-sdk`

OIDC + entitlement helpers for RenVerse apps and platform frontends.

**Contracts:** `contracts/oidc/`, `contracts/openapi/identity.openapi.yaml`  
**Detail:** `docs/revamp/120-implementation/121_AUTH_SDK_DETAILED_CONTRACT.md`  
**Dual mode:** `contracts/flags/dual-mode.md`  
**Directory (API, not JWT):** `docs/revamp/30-identity/37_ORG_DIRECTORY_DEPARTMENTS_TEAMS.md`  
**RBAC:** `docs/revamp/150-spec-complete/155_RBAC_DESIGN_PRINCIPLES.md`

## Shipped today

- TypeScript types in `src/types.ts`: `SuiteRole`, `AccessTokenClaims`, `Membership`, `Department`, `Team`, `AppKey`, …

## Runtime (Phase 1 TODO)

| Export | Purpose |
|--------|---------|
| `createOidcClient` | loginRedirect, handleCallback, logout, validateAccessToken, getSession |
| `hasApp` / `hasAddon` | Entitlement gates from JWT claims |
| `requireAuth` middleware patterns | Express/Fastify/Next |

## Rules

- Suite JWT answers membership + entitlements — **not** product permissions  
- Apps map suite role → local floor on JIT; authorize with local `can()`  
- Never log access/refresh tokens  
- Standalone mode must keep working without Identity  

**Version:** `0.1.0-types`
