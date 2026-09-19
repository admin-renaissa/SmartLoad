async function tokenOf(getter) {
    return getter();
}
function parseSseBlock(block) {
    let type = '';
    const dataLines = [];
    for (const line of block.split('\n')) {
        if (line.startsWith('event:'))
            type = line.slice(6).trim();
        if (line.startsWith('data:'))
            dataLines.push(line.slice(5).trim());
    }
    if (!type)
        return null;
    try {
        return { type, data: JSON.parse(dataLines.join('\n') || '{}') };
    }
    catch {
        return { type, data: { raw: dataLines.join('\n') } };
    }
}
export function createIssaClient(config) {
    const base = config.baseUrl.replace(/\/$/, '');
    async function authHeaders() {
        const token = await tokenOf(config.getAccessToken);
        return {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        };
    }
    return {
        async chat(req) {
            const res = await fetch(`${base}/v1/chat`, {
                method: 'POST',
                headers: {
                    ...(await authHeaders()),
                    accept: 'application/json',
                },
                body: JSON.stringify(req),
            });
            const data = (await res.json().catch(() => ({})));
            if (!res.ok) {
                throw new Error(data.message || data.code || `chat ${res.status}`);
            }
            return data;
        },
        async chatStream(req, onEvent) {
            const res = await fetch(`${base}/v1/chat`, {
                method: 'POST',
                headers: {
                    ...(await authHeaders()),
                    accept: 'text/event-stream',
                },
                body: JSON.stringify(req),
            });
            if (!res.ok || !res.body) {
                const err = (await res.json().catch(() => ({})));
                throw new Error(err.message || `chatStream ${res.status}`);
            }
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buf += decoder.decode(value, { stream: true });
                const parts = buf.split('\n\n');
                buf = parts.pop() || '';
                for (const part of parts) {
                    const ev = parseSseBlock(part);
                    if (ev)
                        onEvent(ev);
                }
            }
            if (buf.trim()) {
                const ev = parseSseBlock(buf);
                if (ev)
                    onEvent(ev);
            }
        },
        async listPersonas(opts) {
            const url = new URL(`${base}/v1/personas`);
            if (opts?.owningApp)
                url.searchParams.set('owningApp', opts.owningApp);
            if (opts?.visibility)
                url.searchParams.set('visibility', opts.visibility);
            const res = await fetch(url, { headers: await authHeaders() });
            const data = (await res.json());
            if (!res.ok)
                throw new Error(`listPersonas ${res.status}`);
            return data.items || [];
        },
        async getCredits(orgId) {
            const res = await fetch(`${base}/v1/credits/${orgId}`, {
                headers: await authHeaders(),
            });
            if (!res.ok)
                throw new Error(`getCredits ${res.status}`);
            return (await res.json());
        },
        async getOrgModelProfile(orgId) {
            const res = await fetch(`${base}/v1/orgs/${encodeURIComponent(orgId)}/model-profile`, {
                headers: await authHeaders(),
            });
            if (!res.ok)
                throw new Error(`getOrgModelProfile ${res.status}`);
            return (await res.json());
        },
        async cancel(traceId) {
            const res = await fetch(`${base}/v1/chat/${traceId}/cancel`, {
                method: 'POST',
                headers: await authHeaders(),
            });
            if (!res.ok && res.status !== 204) {
                throw new Error(`cancel ${res.status}`);
            }
        },
    };
}
