# QA Checklist — SmartLoad

## Standalone

- [ ] Local login works  
- [ ] Local RBAC denies/allows correctly  
- [ ] No Identity dependency  

## Suite

- [ ] OIDC login JIT creates user + floor role  
- [ ] hasAddon(claims, 'smartload') enforced  
- [ ] Local elevation survives `role_changed`  
- [ ] `directory_changed` only hints if on floor  
- [ ] Produce/consume events idempotent  
- [ ] ISSA tool denied without local permission  
- [ ] Deep links resolve  
- [ ] Ban respected: No full WMS/ERP; stay scan/dispatch/POD; optional addon only

---
*RenVerse · SmartLoad · 2026-08-16*
