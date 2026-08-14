/**
 * Unit tests for notification-env channel detection logic.
 * Does NOT need Redis, DB, or network — all env-driven.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// We need to re-import after each env change — use dynamic import so we can
// snapshot the module state per test by resetting the module cache.

type Channel = 'mock' | 'live' | 'misconfigured';
type NotifEnv = {
  getSmsChannel: () => Channel;
  getWhatsAppChannel: () => Channel;
  getEmailChannel: () => Channel;
  notificationsForceMock: () => boolean;
  isSmsMockSend: () => boolean;
  isWhatsAppMockSend: () => boolean;
  isEmailMockSend: () => boolean;
  getNotificationIntegrationStatus: () => {
    forceMock: boolean;
    channels: {
      sms: { state: Channel; detail?: string };
      whatsapp: { state: Channel; detail?: string };
      email: { state: Channel; detail?: string };
    };
  };
};

async function load(): Promise<NotifEnv> {
  return import('../notification-env.js') as Promise<NotifEnv>;
}

describe('notification-env', () => {
  const original = { ...process.env };

  beforeEach(() => {
    // Reset to clean env
    for (const k of [
      'NOTIFICATIONS_FORCE_MOCK',
      'MSG91_API_KEY',
      'MSG91_TEMPLATE_ID_POD',
      'MSG91_SENDER_ID',
      'MSG91_TEMPLATE_ID_OTP',
      'WATI_API_TOKEN',
      'WATI_API_ENDPOINT',
      'SMTP_USER',
      'SMTP_PASS',
    ]) {
      delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...original };
  });

  // ── SMS channel ────────────────────────────────────────────────────────────

  describe('getSmsChannel', () => {
    it('returns mock when no MSG91_API_KEY', async () => {
      const { getSmsChannel } = await load();
      expect(getSmsChannel()).toBe('mock');
    });

    it('returns mock when NOTIFICATIONS_FORCE_MOCK=true even if key is set', async () => {
      process.env.NOTIFICATIONS_FORCE_MOCK = 'true';
      process.env.MSG91_API_KEY = 'key';
      process.env.MSG91_TEMPLATE_ID_POD = 'tpl';
      process.env.MSG91_SENDER_ID = 'SND';
      const { getSmsChannel } = await load();
      expect(getSmsChannel()).toBe('mock');
    });

    it('returns misconfigured when API key set but template/sender missing', async () => {
      process.env.MSG91_API_KEY = 'key';
      const { getSmsChannel } = await load();
      expect(getSmsChannel()).toBe('misconfigured');
    });

    it('returns live when all required SMS env vars are set', async () => {
      process.env.MSG91_API_KEY = 'key';
      process.env.MSG91_TEMPLATE_ID_POD = 'tpl';
      process.env.MSG91_SENDER_ID = 'SNDID';
      const { getSmsChannel } = await load();
      expect(getSmsChannel()).toBe('live');
    });
  });

  // ── WhatsApp channel ───────────────────────────────────────────────────────

  describe('getWhatsAppChannel', () => {
    it('returns mock when no WATI_API_TOKEN', async () => {
      const { getWhatsAppChannel } = await load();
      expect(getWhatsAppChannel()).toBe('mock');
    });

    it('returns misconfigured when token set but no endpoint', async () => {
      process.env.WATI_API_TOKEN = 'tok';
      const { getWhatsAppChannel } = await load();
      expect(getWhatsAppChannel()).toBe('misconfigured');
    });

    it('returns live when both WATI vars set', async () => {
      process.env.WATI_API_TOKEN = 'tok';
      process.env.WATI_API_ENDPOINT = 'https://wati.example.com';
      const { getWhatsAppChannel } = await load();
      expect(getWhatsAppChannel()).toBe('live');
    });

    it('returns mock when NOTIFICATIONS_FORCE_MOCK overrides live config', async () => {
      process.env.NOTIFICATIONS_FORCE_MOCK = '1';
      process.env.WATI_API_TOKEN = 'tok';
      process.env.WATI_API_ENDPOINT = 'https://wati.example.com';
      const { getWhatsAppChannel } = await load();
      expect(getWhatsAppChannel()).toBe('mock');
    });
  });

  // ── Email channel ──────────────────────────────────────────────────────────

  describe('getEmailChannel', () => {
    it('returns mock when SMTP_USER missing', async () => {
      const { getEmailChannel } = await load();
      expect(getEmailChannel()).toBe('mock');
    });

    it('returns live when SMTP_USER and SMTP_PASS both set', async () => {
      process.env.SMTP_USER = 'user@example.com';
      process.env.SMTP_PASS = 'pass';
      const { getEmailChannel } = await load();
      expect(getEmailChannel()).toBe('live');
    });
  });

  // ── Force mock ─────────────────────────────────────────────────────────────

  describe('notificationsForceMock', () => {
    it('returns false by default', async () => {
      const { notificationsForceMock } = await load();
      expect(notificationsForceMock()).toBe(false);
    });

    it('returns true for "true"', async () => {
      process.env.NOTIFICATIONS_FORCE_MOCK = 'true';
      const { notificationsForceMock } = await load();
      expect(notificationsForceMock()).toBe(true);
    });

    it('returns true for "1"', async () => {
      process.env.NOTIFICATIONS_FORCE_MOCK = '1';
      const { notificationsForceMock } = await load();
      expect(notificationsForceMock()).toBe(true);
    });

    it('returns false for "false"', async () => {
      process.env.NOTIFICATIONS_FORCE_MOCK = 'false';
      const { notificationsForceMock } = await load();
      expect(notificationsForceMock()).toBe(false);
    });
  });

  // ── getNotificationIntegrationStatus ──────────────────────────────────────

  describe('getNotificationIntegrationStatus', () => {
    it('returns correct shape with all channels in mock state by default', async () => {
      const { getNotificationIntegrationStatus } = await load();
      const status = getNotificationIntegrationStatus();
      expect(status).toHaveProperty('forceMock');
      expect(status).toHaveProperty('channels');
      expect(status.channels).toHaveProperty('sms');
      expect(status.channels).toHaveProperty('whatsapp');
      expect(status.channels).toHaveProperty('email');
      expect(status.channels.sms.state).toBe('mock');
      expect(status.channels.whatsapp.state).toBe('mock');
      expect(status.channels.email.state).toBe('mock');
    });

    it('forceMock=true when NOTIFICATIONS_FORCE_MOCK set', async () => {
      process.env.NOTIFICATIONS_FORCE_MOCK = 'true';
      const { getNotificationIntegrationStatus } = await load();
      expect(getNotificationIntegrationStatus().forceMock).toBe(true);
    });
  });

  // ── isSmsMockSend / isWhatsAppMockSend / isEmailMockSend ──────────────────

  describe('mock helpers', () => {
    it('isSmsMockSend returns true when channel is not live', async () => {
      const { isSmsMockSend } = await load();
      expect(isSmsMockSend()).toBe(true);
    });

    it('isWhatsAppMockSend returns true when channel is not live', async () => {
      const { isWhatsAppMockSend } = await load();
      expect(isWhatsAppMockSend()).toBe(true);
    });

    it('isEmailMockSend returns true when channel is not live', async () => {
      const { isEmailMockSend } = await load();
      expect(isEmailMockSend()).toBe(true);
    });
  });
});
