import { useAuthStore } from '../store/authStore.ts';
import { PERMISSIONS, type Permission } from '@smartload/shared';
import type { UserRole } from '@smartload/shared';

export function usePermission(permission: Permission): boolean {
  const role = useAuthStore((state) => state.user?.role);
  if (!role) return false;
  const allowedRoles = PERMISSIONS[permission] as unknown as UserRole[];
  return allowedRoles.includes(role);
}

export function useRole(): UserRole | undefined {
  return useAuthStore((state) => state.user?.role);
}
