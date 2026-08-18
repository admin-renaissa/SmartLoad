# Entitlements & Gates — SmartLoad

Entitlement = may **open** the app. Local RBAC = may **act**.

Gate key: **addons[] / smartload**

```
// Suite entry
if (mode === 'suite' && !hasAddon(claims, 'smartload')) deny('Not entitled');

// Every mutating API
can(user, permission) && in_scope(user, resource)
```

Standalone: skip entitlement; local RBAC only.

SmartLoad is an **optional add-on** — never require it for Suite SKU.

Grace: optional short window after revoke using token `exp`; then hard block.

See `153` / `51_ENTITLEMENTS_MODEL.md`.

---
*RenVerse · SmartLoad · 2026-08-16*
