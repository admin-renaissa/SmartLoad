/** Standalone apps never apply sibling sync. */
export async function isPairApplyAllowed(client, input) {
    if (String(input.mode || process.env.RENVERSE_MODE || '').toLowerCase() !== 'suite') {
        return false;
    }
    const result = await client.pairEnabled({
        orgId: input.orgId,
        sourceApp: input.sourceApp,
        targetApp: input.targetApp,
        eventType: input.eventType,
    });
    return result.enabled;
}
