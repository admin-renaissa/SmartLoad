import { Router } from 'express';
import { verifyToolToken } from './token.js';
export function createIssaToolRouter(opts) {
    const r = Router();
    const issuer = opts.issuer || process.env.RENVERSE_ISSA_URL || 'http://localhost:9120';
    r.post('/issa/tools/:toolId', async (req, res) => {
        const toolId = String(req.params.toolId || '');
        const auth = String(req.headers.authorization || '');
        if (!auth.startsWith('Bearer ')) {
            res.status(401).json({ code: 'unauthorized', message: 'tool token required' });
            return;
        }
        let claims;
        try {
            claims = await verifyToolToken(auth.slice(7), {
                secret: opts.secret,
                issuer,
                audience: opts.appKey,
            });
        }
        catch {
            res.status(401).json({ code: 'unauthorized', message: 'invalid tool token' });
            return;
        }
        if (claims.tool_id !== toolId) {
            res.status(403).json({ code: 'forbidden', message: 'tool_id mismatch' });
            return;
        }
        const handler = opts.handlers[toolId];
        if (!handler) {
            res.status(404).json({ code: 'not_found', message: 'unknown tool' });
            return;
        }
        const body = (req.body || {});
        const ctx = {
            claims,
            correlationId: String(body.correlationId || ''),
            dryRun: Boolean(body.dryRun),
            arguments: body.arguments || {},
        };
        if (opts.authorize && !(await opts.authorize(ctx))) {
            res.status(403).json({ code: 'forbidden', message: 'authz denied' });
            return;
        }
        try {
            const result = await handler(ctx.arguments, ctx);
            res.json({ ok: true, result });
        }
        catch (e) {
            const err = e;
            if (err.status === 403 || err.code === 'forbidden') {
                res.status(403).json({
                    ok: false,
                    result: null,
                    errorCode: 'forbidden',
                });
                return;
            }
            res.status(409).json({
                ok: false,
                result: null,
                errorCode: err.code || 'conflict',
            });
        }
    });
    return r;
}
