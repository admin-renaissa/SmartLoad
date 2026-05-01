import { UserRole } from '../types/enums.js'

export const PERMISSIONS = {
  'orders:create': [UserRole.ADMIN, UserRole.SUPERVISOR],
  'orders:update': [UserRole.ADMIN, UserRole.SUPERVISOR],
  'orders:delete': [UserRole.ADMIN],
  'orders:view': [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS],
  'products:manage': [UserRole.ADMIN],
  'products:view': [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS, UserRole.OPERATOR],
  'sessions:create': [UserRole.ADMIN, UserRole.SUPERVISOR],
  'sessions:close': [UserRole.ADMIN, UserRole.SUPERVISOR],
  'sessions:view': [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR, UserRole.ACCOUNTS],
  'inventory:view': [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS],
  'inventory:adjust': [UserRole.ADMIN],
  'grn:create': [UserRole.ADMIN, UserRole.SUPERVISOR],
  'grn:view': [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS],
  'vehicles:manage': [UserRole.ADMIN],
  'vehicles:view': [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.DRIVER],
  'users:manage': [UserRole.ADMIN],
  'tally:sync': [UserRole.ADMIN, UserRole.ACCOUNTS],
  'tally:view': [UserRole.ADMIN, UserRole.ACCOUNTS],
  'reports:view': [UserRole.ADMIN, UserRole.ACCOUNTS, UserRole.SUPERVISOR],
  'dashboard:executive': [UserRole.ADMIN, UserRole.ACCOUNTS],
  'dashboard:supervisor': [UserRole.ADMIN, UserRole.SUPERVISOR],
  'scan:operate': [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.OPERATOR],
  'audit:view': [UserRole.ADMIN],
  'settings:manage': [UserRole.ADMIN],
  'clients:manage': [UserRole.ADMIN, UserRole.SUPERVISOR],
  'clients:view': [UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.ACCOUNTS],
} as const

export type Permission = keyof typeof PERMISSIONS
