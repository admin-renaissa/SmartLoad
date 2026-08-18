# Local Dev — SmartLoad

```bash
export RENVERSE_MODE=standalone   # or suite
export RENVERSE_ISSUER=http://localhost:9100
export RENVERSE_CLIENT_ID=smartload-dev
```

- Stub Identity/Connect: `docs/revamp/120-implementation/123_LOCAL_STUB_IDENTITY_CONNECT.md`  
- Standalone must work with zero Identity  
- Suite: run platform docker-compose Identity + this app  

Ports: follow app README; Identity default `9100`.

---
*RenVerse · SmartLoad · 2026-08-16*


## Suite packages (local RenVerse monorepo)

From `SmartLoad/apps/api` (three levels up to RenVerse root `packages/`):

```json
"@renverse/auth-sdk": "file:../../../packages/auth-sdk",
"@renverse/connect-sdk": "file:../../../packages/connect-sdk",
"@renverse/suite-oidc-adapter": "file:../../../packages/suite-oidc-adapter"
```

Also: `@fastify/middie`, `express`, `cookie-parser` (suite OIDC adapter is Express; middie bridges Fastify).

SmartLoad root `package.json` includes `pnpm.overrides` so nested `@renverse/*` from `suite-oidc-adapter` resolve to `file:../packages/...` (sibling RenVerse packages), not the public npm registry.

```bash
export RENVERSE_MODE=suite
export RENVERSE_APP_KEY=smartload
export SMARTLOAD_TALLY_MODE=onprem   # default — Tally bridge stays on-prem
export RENVERSE_OIDC_ISSUER=http://localhost:9100
export RENVERSE_CONNECT_URL=http://localhost:9110
curl -s http://localhost:4000/renverse/status
```

Platform mirror host: RenVerse `apps/suite-host-smartload` `:9203`.
Entitlement: `addons[]` / `hasAddon('smartload')` — not `apps[]`.

