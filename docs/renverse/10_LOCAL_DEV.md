# Local Dev — SmartLoad

```bash
export RENVERSE_MODE=standalone   # or suite
export RENVERSE_APP_KEY=smartload
export RENVERSE_OIDC_ISSUER=http://localhost:9100
export RENVERSE_OIDC_CLIENT_ID=app_smartload_web
export RENVERSE_CONNECT_URL=http://localhost:9110
export SMARTLOAD_TALLY_MODE=onprem
```

Platform: RenVerse `./run-renverse.sh` (Identity `:9100`, Connect `:9110`).

## Suite packages

From `SmartLoad/apps/api` (path to RenVerse `packages/`):

```json
"@renverse/auth-sdk": "file:../../../packages/auth-sdk",
"@renverse/connect-sdk": "file:../../../packages/connect-sdk",
"@renverse/suite-oidc-adapter": "file:../../../packages/suite-oidc-adapter"
```

Also: `@fastify/middie`, `express`, `cookie-parser` (Express adapter + Fastify). Root `pnpm.overrides` for nested `@renverse/*` → sibling packages.

```bash
curl -s http://localhost:<api-port>/renverse/status
# Smoke POD (lab): POST /renverse/shipments/:id/pod
```

## Notes

- Standalone must work with zero Identity  
- Driver offline flows must not hard-require suite  
- Addon entitlement tests: JWT without `addons: ["smartload"]` → 403  

---

*RenVerse · SmartLoad Local Dev · 2026-08-19*
