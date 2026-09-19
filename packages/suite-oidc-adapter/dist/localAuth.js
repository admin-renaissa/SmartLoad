import bcrypt from 'bcryptjs';
export function createInMemoryLocalAuthStore(appKey) {
    const users = new Map();
    const byEmail = new Map();
    function norm(email) {
        return email.trim().toLowerCase();
    }
    return {
        findByEmail(email, tenantId) {
            const ids = byEmail.get(norm(email));
            if (!ids)
                return undefined;
            for (const id of ids) {
                const user = users.get(id);
                if (!user)
                    continue;
                if (tenantId && user.tenantId !== tenantId)
                    continue;
                return user;
            }
            return undefined;
        },
        findById(id) {
            return users.get(id);
        },
        countByEmailInTenant(email, tenantId) {
            const ids = byEmail.get(norm(email));
            if (!ids)
                return 0;
            let n = 0;
            for (const id of ids) {
                const user = users.get(id);
                if (user?.tenantId === tenantId)
                    n += 1;
            }
            return n;
        },
        setRenverseSub(localUserId, sub) {
            const user = users.get(localUserId);
            if (!user)
                return;
            users.set(localUserId, { ...user, renverseSub: sub });
        },
        async verifyPassword(user, password) {
            return bcrypt.compare(password, user.passwordHash);
        },
        async seedDemoUser(input) {
            const email = norm(input.email);
            const id = `local_demo_${appKey}`;
            if (users.has(id))
                return;
            const passwordHash = await bcrypt.hash(input.password, 10);
            const user = {
                id,
                email,
                passwordHash,
                tenantId: input.tenantId,
            };
            users.set(id, user);
            const set = byEmail.get(email) ?? new Set();
            set.add(id);
            byEmail.set(email, set);
        },
        seedDemoUserSync(input) {
            const email = norm(input.email);
            const id = `local_demo_${appKey}`;
            if (users.has(id))
                return;
            const passwordHash = bcrypt.hashSync(input.password, 10);
            const user = {
                id,
                email,
                passwordHash,
                tenantId: input.tenantId,
            };
            users.set(id, user);
            const set = byEmail.get(email) ?? new Set();
            set.add(id);
            byEmail.set(email, set);
        },
    };
}
export const LOCAL_SESSION_COOKIE = 'rv_local_session';
export const LINK_USER_COOKIE = 'rv_link_uid';
