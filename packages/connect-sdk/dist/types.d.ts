/**
 * @renverse/connect-sdk — IdMap + event publish + local outbox helpers (Phase 3)
 */
export type AppKey = 'identity' | 'renbooks' | 'renexus' | 'renorc' | 'renovax' | 'creator' | 'renaura' | 'smartload' | 'billing' | 'issa' | 'connect';
export interface EventEnvelope<TPayload extends object = Record<string, unknown>> {
    id: string;
    type: string;
    source: AppKey;
    orgId: string;
    occurredAt: string;
    correlationId?: string;
    idempotencyKey?: string;
    specVersion: '1.0';
    payload: TPayload;
}
export interface EventDraft<TPayload extends object = Record<string, unknown>> {
    type: string;
    source: AppKey;
    orgId: string;
    payload: TPayload;
    correlationId?: string;
    idempotencyKey?: string;
}
export interface IdMapRecord {
    orgId: string;
    entityType: string;
    sourceApp: AppKey | string;
    sourceId: string;
    targetApp: AppKey | string;
    targetId: string;
    meta?: Record<string, unknown>;
}
export interface ConnectClientConfig {
    baseUrl: string;
    serviceToken: string;
}
export interface ConnectMetrics {
    pending: number;
    delivered: number;
    failed: number;
    dlqDepth: number;
    oldestPendingLagSeconds: number;
}
export interface ConnectClient {
    publish(event: EventEnvelope): Promise<{
        id: string;
        status: string;
        duplicate?: boolean;
    }>;
    listEvents(query?: {
        orgId?: string;
        type?: string;
        status?: string;
        limit?: number;
    }): Promise<EventEnvelope[]>;
    ack(eventId: string, consumerKey: string): Promise<void>;
    fail(eventId: string, consumerKey: string, error: string): Promise<void>;
    listDlq(): Promise<Array<{
        id: number;
        eventId: string;
        consumerKey: string;
        error: string;
        attempts: number;
    }>>;
    replayDlq(id: number): Promise<void>;
    metrics(): Promise<ConnectMetrics>;
    resolve(query: Omit<IdMapRecord, 'targetId' | 'meta'>): Promise<string | null>;
    putIdMap(record: IdMapRecord): Promise<void>;
    listSyncPairs(orgId: string): Promise<unknown[]>;
    putSyncPair(input: {
        orgId: string;
        packId: string;
        status: 'enabled' | 'disabled';
        policy?: 'off' | 'manual' | 'auto';
    }): Promise<unknown>;
    pairEnabled(input: {
        orgId: string;
        sourceApp: string;
        targetApp: string;
        eventType?: string;
    }): Promise<{
        enabled: boolean;
        items: unknown[];
    }>;
}
export interface OutboxRow {
    eventId: string;
    type: string;
    orgId: string;
    payload: EventEnvelope | Record<string, unknown>;
    createdAt?: Date | string;
    publishedAt?: Date | string | null;
}
/** App-provided persistence for transactional outbox. */
export interface OutboxStore {
    insert(row: {
        eventId: string;
        type: string;
        orgId: string;
        payload: EventEnvelope;
    }): Promise<void>;
    listUnpublished(limit: number): Promise<OutboxRow[]>;
    markPublished(eventId: string): Promise<void>;
}
export declare function createEventId(): string;
export declare function createEnvelope<T extends object>(draft: EventDraft<T>): EventEnvelope<T>;
/**
 * Insert a fully-formed envelope into the local outbox (same TX as SoR write).
 */
export declare function withOutbox(store: OutboxStore, draft: EventDraft): Promise<EventEnvelope>;
/**
 * Relay unpublished outbox rows to Connect. Returns count published.
 * Connect down → throws; caller should leave rows unpublished (apps stay usable).
 */
export declare function relayOutbox(store: OutboxStore, client: ConnectClient, batchSize?: number): Promise<number>;
export declare function createConnectClient(config: ConnectClientConfig): ConnectClient;
