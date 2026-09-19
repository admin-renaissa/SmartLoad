import type { ConnectClient } from './types.js';
/** Standalone apps never apply sibling sync. */
export declare function isPairApplyAllowed(client: ConnectClient, input: {
    mode?: string;
    orgId: string;
    sourceApp: string;
    targetApp: string;
    eventType?: string;
}): Promise<boolean>;
