import bcrypt from 'bcryptjs';

export type LocalUser = {
  id: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  renverseSub?: string;
};

export type LocalAuthStore = {
  findByEmail(email: string, tenantId?: string): LocalUser | undefined;
  findById(id: string): LocalUser | undefined;
  countByEmailInTenant(email: string, tenantId: string): number;
  setRenverseSub(localUserId: string, sub: string): void;
  verifyPassword(user: LocalUser, password: string): Promise<boolean>;
  seedDemoUser(input: { email: string; password: string; tenantId: string }): Promise<void>;
  seedDemoUserSync(input: { email: string; password: string; tenantId: string }): void;
};

export function createInMemoryLocalAuthStore(appKey: string): LocalAuthStore {
  const users = new Map<string, LocalUser>();
  const byEmail = new Map<string, Set<string>>();

  function norm(email: string) {
    return email.trim().toLowerCase();
  }

  return {
    findByEmail(email, tenantId) {
      const ids = byEmail.get(norm(email));
      if (!ids) return undefined;
      for (const id of ids) {
        const user = users.get(id);
        if (!user) continue;
        if (tenantId && user.tenantId !== tenantId) continue;
        return user;
      }
      return undefined;
    },
    findById(id) {
      return users.get(id);
    },
    countByEmailInTenant(email, tenantId) {
      const ids = byEmail.get(norm(email));
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) {
        const user = users.get(id);
        if (user?.tenantId === tenantId) n += 1;
      }
      return n;
    },
    setRenverseSub(localUserId, sub) {
      const user = users.get(localUserId);
      if (!user) return;
      users.set(localUserId, { ...user, renverseSub: sub });
    },
    async verifyPassword(user, password) {
      return bcrypt.compare(password, user.passwordHash);
    },
    async seedDemoUser(input) {
      const email = norm(input.email);
      const id = `local_demo_${appKey}`;
      if (users.has(id)) return;
      const passwordHash = await bcrypt.hash(input.password, 10);
      const user: LocalUser = {
        id,
        email,
        passwordHash,
        tenantId: input.tenantId,
      };
      users.set(id, user);
      const set = byEmail.get(email) ?? new Set<string>();
      set.add(id);
      byEmail.set(email, set);
    },
    seedDemoUserSync(input) {
      const email = norm(input.email);
      const id = `local_demo_${appKey}`;
      if (users.has(id)) return;
      const passwordHash = bcrypt.hashSync(input.password, 10);
      const user: LocalUser = {
        id,
        email,
        passwordHash,
        tenantId: input.tenantId,
      };
      users.set(id, user);
      const set = byEmail.get(email) ?? new Set<string>();
      set.add(id);
      byEmail.set(email, set);
    },
  };
}

export const LOCAL_SESSION_COOKIE = 'rv_local_session';
export const LINK_USER_COOKIE = 'rv_link_uid';
