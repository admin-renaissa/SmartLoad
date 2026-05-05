import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { UserRole } from '@prisma/client';
import type { JwtPayload } from '../../plugins/auth.js';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;

function getRefreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret-min-32-chars';
}

function getTwoFaPendingSecret(): string {
  return process.env.JWT_TWOFA_PENDING_SECRET || `${getRefreshSecret()}-2fa-pending`;
}

function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

type UserIssue = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
};

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private fastify: FastifyInstance,
  ) {}

  private issueTokens(user: UserIssue) {
    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as JwtPayload['role'],
      name: user.name,
    };

    const accessToken = this.fastify.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload as object, getRefreshSecret(), { expiresIn: '7d' });
    return { accessToken, refreshToken, payload };
  }

  async persistRefreshSession(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    await this.redis.setex(`refresh:${userId}:${tokenHash}`, REFRESH_TOKEN_TTL, '1');
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        passwordHash: true,
        isActive: true,
        twoFactorEnabled: true,
        totpSecret: true,
      },
    });

    if (!user || !user.isActive) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    const needs2faRole = user.role === UserRole.ADMIN || user.role === UserRole.ACCOUNTS;
    if (user.twoFactorEnabled && user.totpSecret && needs2faRole) {
      const twoFactorToken = jwt.sign(
        { userId: user.id, typ: '2fa_pending' },
        getTwoFaPendingSecret(),
        { expiresIn: '5m' },
      );
      return { needsTwoFactor: true as const, twoFactorToken };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = this.issueTokens(user);
    await this.persistRefreshSession(user.id, refreshToken);

    return {
      needsTwoFactor: false as const,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
    };
  }

  async completeTwoFactorLogin(twoFactorToken: string, code: string) {
    let decoded: { userId?: string; typ?: string };
    try {
      decoded = jwt.verify(twoFactorToken, getTwoFaPendingSecret()) as { userId?: string; typ?: string };
    } catch {
      throw Object.assign(new Error('Verification session expired. Sign in again.'), { statusCode: 401 });
    }
    if (decoded.typ !== '2fa_pending' || !decoded.userId) {
      throw Object.assign(new Error('Invalid verification session'), { statusCode: 401 });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        totpSecret: true,
        twoFactorEnabled: true,
      },
    });

    if (!user?.isActive || !user.twoFactorEnabled || !user.totpSecret) {
      throw Object.assign(new Error('Two-factor authentication is not active for this account'), { statusCode: 400 });
    }

    const ok = authenticator.verify({ token: code.replace(/\s/g, ''), secret: user.totpSecret });
    if (!ok) {
      throw Object.assign(new Error('Invalid authenticator code'), { statusCode: 401 });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = this.issueTokens(user);
    await this.persistRefreshSession(user.id, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
      },
    };
  }

  /** Begin TOTP enrollment (ADMIN / ACCOUNTS only). Returns secret + otpauth URL; enable with {@link enableTwoFactor}. */
  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.ACCOUNTS) {
      throw Object.assign(new Error('Two-factor enrollment is only for Admin and Accounts roles'), { statusCode: 403 });
    }

    const secret = authenticator.generateSecret();
    const issuer = process.env.COMPANY_NAME || 'SmartLoad';
    const otpauthUrl = authenticator.keyuri(user.email, issuer, secret);
    return { secret, otpauthUrl };
  }

  async enableTwoFactor(userId: string, secret: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.ACCOUNTS) {
      throw Object.assign(new Error('Two-factor enrollment is only for Admin and Accounts roles'), { statusCode: 403 });
    }

    const ok = authenticator.verify({ token: code.replace(/\s/g, ''), secret });
    if (!ok) {
      throw Object.assign(new Error('Invalid authenticator code'), { statusCode: 400 });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: secret, twoFactorEnabled: true },
    });
    return { message: 'Two-factor authentication enabled' };
  }

  async disableTwoFactor(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      throw Object.assign(new Error('Password is incorrect'), { statusCode: 400 });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, twoFactorEnabled: false },
    });
    return { message: 'Two-factor authentication disabled' };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = jwt.verify(refreshToken, getRefreshSecret()) as {
        userId: string;
        email: string;
        role: string;
        name: string;
      };

      const tokenHash = hashRefreshToken(refreshToken);
      const exists = await this.redis.get(`refresh:${payload.userId}:${tokenHash}`);

      if (!exists) {
        throw Object.assign(new Error('Refresh token has been revoked'), { statusCode: 401 });
      }

      const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
      if (!user || !user.isActive) {
        throw Object.assign(new Error('User not found or inactive'), { statusCode: 401 });
      }

      const newPayload: JwtPayload = {
        userId: user.id,
        email: user.email,
        role: user.role as JwtPayload['role'],
        name: user.name,
      };
      const accessToken = this.fastify.jwt.sign(newPayload, { expiresIn: '15m' });
      const newRefreshToken = jwt.sign(newPayload as object, getRefreshSecret(), { expiresIn: '7d' });

      await this.redis.del(`refresh:${payload.userId}:${tokenHash}`);
      const newTokenHash = hashRefreshToken(newRefreshToken);
      await this.redis.setex(`refresh:${payload.userId}:${newTokenHash}`, REFRESH_TOKEN_TTL, '1');

      return { accessToken, refreshToken: newRefreshToken };
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode) throw err;
      throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
    }
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);
      await this.redis.del(`refresh:${userId}:${tokenHash}`);
    } else {
      const keys = await this.redis.keys(`refresh:${userId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 404 });
    }

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      throw Object.assign(new Error('Current password is incorrect'), { statusCode: 400 });
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    await this.logout(userId);
  }
}
