# ISSA Tools — SmartLoad

Register when `renverse.issa` enabled. Callbacks: `POST /issa/tools/:toolId`.

## Tools

- `smartload.shipment.get`
- `smartload.pod.list`
- `smartload.scan.lookup`

## Rules

1. Verify tool token (org + user + tool + TTL)  
2. Load local user by `sub` → **local** `can()` + scope  
3. Mutating tools call **this app’s** API only  
4. Hub does not evaluate product RBAC  

Ban: No full WMS/ERP; stay scan/dispatch/POD; optional addon only

---
*RenVerse · SmartLoad · 2026-08-16*
