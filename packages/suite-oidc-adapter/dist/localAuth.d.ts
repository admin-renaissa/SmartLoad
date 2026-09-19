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
    seedDemoUser(input: {
        email: string;
        password: string;
        tenantId: string;
    }): Promise<void>;
    seedDemoUserSync(input: {
        email: string;
        password: string;
        tenantId: string;
    }): void;
};
export declare function createInMemoryLocalAuthStore(appKey: string): LocalAuthStore;
export declare const LOCAL_SESSION_COOKIE = "rv_local_session";
export declare const LINK_USER_COOKIE = "rv_link_uid";
