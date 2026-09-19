export function completeAccountLink(input) {
    const local = input.store.findById(input.localUserId);
    if (!local) {
        return { ok: false, error: 'link_user_missing' };
    }
    if (local.renverseSub && local.renverseSub !== input.claims.sub) {
        return { ok: false, error: 'link_conflict' };
    }
    const localEmail = local.email.trim().toLowerCase();
    const identityEmail = String(input.claims.email || '').trim().toLowerCase();
    if (!identityEmail || localEmail !== identityEmail) {
        return { ok: false, error: 'link_email_mismatch' };
    }
    if (input.store.countByEmailInTenant(localEmail, local.tenantId) > 1 &&
        !local.renverseSub) {
        return { ok: false, error: 'link_conflict' };
    }
    input.store.setRenverseSub(local.id, input.claims.sub);
    return { ok: true, status: 'linked', sub: input.claims.sub };
}
