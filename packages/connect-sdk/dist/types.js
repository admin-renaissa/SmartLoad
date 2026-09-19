/**
 * @renverse/connect-sdk — IdMap + event publish + local outbox helpers (Phase 3)
 */
export function createEventId() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return `evt_${Buffer.from(bytes).toString('hex')}`;
}
export function createEnvelope(draft) {
    return {
        id: createEventId(),
        type: draft.type,
        source: draft.source,
        orgId: draft.orgId,
        occurredAt: new Date().toISOString(),
        correlationId: draft.correlationId,
        idempotencyKey: draft.idempotencyKey,
        specVersion: '1.0',
        payload: draft.payload,
    };
}
/**
 * Insert a fully-formed envelope into the local outbox (same TX as SoR write).
 */
export async function withOutbox(store, draft) {
    const envelope = createEnvelope(draft);
    await store.insert({
        eventId: envelope.id,
        type: envelope.type,
        orgId: envelope.orgId,
        payload: envelope,
    });
    return envelope;
}
/**
 * Relay unpublished outbox rows to Connect. Returns count published.
 * Connect down → throws; caller should leave rows unpublished (apps stay usable).
 */
export async function relayOutbox(store, client, batchSize = 25) {
    const rows = await store.listUnpublished(batchSize);
    let n = 0;
    for (const row of rows) {
        const raw = row.payload;
        const envelope = raw &&
            typeof raw === 'object' &&
            'specVersion' in raw &&
            'payload' in raw &&
            'id' in raw
            ? raw
            : {
                id: row.eventId,
                type: row.type,
                source: 'connect',
                orgId: row.orgId,
                occurredAt: new Date().toISOString(),
                specVersion: '1.0',
                payload: raw || {},
            };
        await client.publish(envelope);
        await store.markPublished(row.eventId);
        n += 1;
    }
    return n;
}
export function createConnectClient(config) {
    const base = config.baseUrl.replace(/\/$/, '');
    const headers = {
        authorization: `Bearer ${config.serviceToken}`,
        'content-type': 'application/json',
    };
    async function json(res) {
        const text = await res.text();
        try {
            return JSON.parse(text);
        }
        catch {
            throw new Error(`connect non-json ${res.status}: ${text.slice(0, 200)}`);
        }
    }
    return {
        async publish(event) {
            const res = await fetch(`${base}/v1/events`, {
                method: 'POST',
                headers,
                body: JSON.stringify(event),
            });
            if (!res.ok && res.status !== 202) {
                const text = await res.text();
                throw new Error(`publish failed: ${res.status} ${text}`);
            }
            return json(res);
        },
        async listEvents(query = {}) {
            const url = new URL(`${base}/v1/events`);
            if (query.orgId)
                url.searchParams.set('orgId', query.orgId);
            if (query.type)
                url.searchParams.set('type', query.type);
            if (query.status)
                url.searchParams.set('status', query.status);
            if (query.limit)
                url.searchParams.set('limit', String(query.limit));
            const res = await fetch(url, { headers });
            if (!res.ok)
                throw new Error(`listEvents failed: ${res.status}`);
            const data = await json(res);
            return data.items || [];
        },
        async ack(eventId, consumerKey) {
            const res = await fetch(`${base}/v1/events/${encodeURIComponent(eventId)}/ack`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ consumerKey }),
            });
            if (!res.ok)
                throw new Error(`ack failed: ${res.status}`);
        },
        async fail(eventId, consumerKey, error) {
            const res = await fetch(`${base}/v1/events/${encodeURIComponent(eventId)}/fail`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ consumerKey, error }),
            });
            if (!res.ok)
                throw new Error(`fail failed: ${res.status}`);
        },
        async listDlq() {
            const res = await fetch(`${base}/v1/dlq`, { headers });
            if (!res.ok)
                throw new Error(`listDlq failed: ${res.status}`);
            const data = await json(res);
            return data.items;
        },
        async replayDlq(id) {
            const res = await fetch(`${base}/v1/dlq/${id}/replay`, {
                method: 'POST',
                headers,
            });
            if (!res.ok)
                throw new Error(`replayDlq failed: ${res.status}`);
        },
        async metrics() {
            const res = await fetch(`${base}/v1/metrics`, { headers });
            if (!res.ok)
                throw new Error(`metrics failed: ${res.status}`);
            return json(res);
        },
        async resolve(q) {
            const url = new URL(`${base}/v1/idmap`);
            url.searchParams.set('orgId', q.orgId);
            url.searchParams.set('entityType', q.entityType);
            url.searchParams.set('sourceApp', String(q.sourceApp));
            url.searchParams.set('sourceId', q.sourceId);
            url.searchParams.set('targetApp', String(q.targetApp));
            const res = await fetch(url, { headers });
            if (res.status === 404)
                return null;
            if (!res.ok) {
                throw new Error(`idmap resolve failed: ${res.status}`);
            }
            const data = (await res.json());
            return data.targetId;
        },
        async putIdMap(record) {
            const res = await fetch(`${base}/v1/idmap`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(record),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`idmap put failed: ${res.status} ${text}`);
            }
        },
        async listSyncPairs(orgId) {
            const url = new URL(`${base}/v1/sync-pairs`);
            url.searchParams.set('orgId', orgId);
            const res = await fetch(url, { headers });
            if (!res.ok)
                throw new Error(`listSyncPairs failed: ${res.status}`);
            const data = (await res.json());
            return data.items || [];
        },
        async putSyncPair(input) {
            const res = await fetch(`${base}/v1/sync-pairs`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(input),
            });
            if (!res.ok)
                throw new Error(`putSyncPair failed: ${res.status}`);
            return res.json();
        },
        async pairEnabled(input) {
            const url = new URL(`${base}/v1/sync-pairs/enabled`);
            url.searchParams.set('orgId', input.orgId);
            url.searchParams.set('sourceApp', input.sourceApp);
            url.searchParams.set('targetApp', input.targetApp);
            if (input.eventType)
                url.searchParams.set('eventType', input.eventType);
            const res = await fetch(url, { headers });
            if (!res.ok)
                return { enabled: false, items: [] };
            return res.json();
        },
    };
}
