import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import type { JwtPayload } from '../../plugins/auth.js';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

function getRefreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET || 'change-me-refresh-secret-min-32-chars';
}

function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

export class AuthService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private fastify: FastifyInstance,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user || !user.isActive) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload: JwtPayload = {
      userId: user.id,
      email: user.email,
      role: user.role as JwtPayload['role'],
      name: user.name,
    };

    const accessToken = this.fastify.jwt.sign(payload, { expiresIn: '15m' });
    const refreshToken = jwt.sign(payload as object, getRefreshSecret(), { expiresIn: '7d' });

    const tokenHash = hashRefreshToken(refreshToken);
    await this.redis.setex(`refresh:${user.id}:${tokenHash}`, REFRESH_TOKEN_TTL, '1');

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
