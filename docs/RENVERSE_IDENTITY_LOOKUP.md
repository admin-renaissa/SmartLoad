# RenVerse identity directory lookup

Service-to-service directory used by RenIdentity for existing-app onboarding and org-admin mapping.

```
GET /renverse/identity/lookup-by-email?email=someone@example.com
Authorization: Bearer <APP_DIRECTORY_SERVICE_TOKEN>

200 { "matches": [{ "externalTenantId": "...", "organizationName": "...", "tenantName": "...", "role": "..." }] }

GET /renverse/identity/lookup-by-org?name=Acme
Authorization: Bearer <APP_DIRECTORY_SERVICE_TOKEN>

200 { "matches": [{ "externalTenantId": "...", "organizationName": "...", "tenantName": "..." }] }
```

- Bearer `APP_DIRECTORY_SERVICE_TOKEN` is checked before any query.
- `externalTenantId` is the **local** `Organization.id`, including standalone orgs with a null `renverseOrgId`.
- `tenantName` is an alias of `organizationName`. Name search is ILIKE on `Organization.name` (min 3 chars, cap 10). No domain column.
- Implementation: `apps/api/src/renverse/app-directory.ts`.
