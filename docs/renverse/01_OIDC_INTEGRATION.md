# OIDC Integration — SmartLoad

1. Register confidential/public client for `smartload`  
2. Use `@renverse/auth-sdk` createOidcClient  
3. Scopes: openid profile email offline_access  
4. Validate access token; read `org_id`, `apps`, `addons`, `roles`  
5. JIT per 02; never trust roles as product permissions  
6. RP-initiated logout  

Errors: `contracts/oidc/errors.md`. Dual-mode: `contracts/flags/dual-mode.md`.

---
*RenVerse · SmartLoad · 2026-08-16*
