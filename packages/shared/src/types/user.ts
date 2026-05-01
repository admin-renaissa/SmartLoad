import type { UserRole } from './enums.js'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  phone: string | null
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthTokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface JwtPayload {
  sub: string
  email: string
  role: UserRole
  iat: number
  exp: number
}
