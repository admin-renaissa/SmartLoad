/**
 * Central place for mock vs live notification channels (SMS / WhatsApp / email).
 * Used by the notification worker and GET /api/v1/integrations/notifications.
 */

export function notificationsForceMock(): boolean {
  const v = process.env.NOTIFICATIONS_FORCE_MOCK;
  return v === 'true' || v === '1';
}

type Channel = 'mock' | 'live' | 'misconfigured';

export function getSmsChannel(): Channel {
  if (notificationsForceMock()) return 'mock';
  if (!process.env.MSG91_API_KEY) return 'mock';
  // Need at least the POD dispatch template; OTP template is optional (falls back to raw message)
  if (!process.env.MSG91_TEMPLATE_ID_POD || !process.env.MSG91_SENDER_ID) return 'misconfigured';
  return 'live';
}

export function getWhatsAppChannel(): Channel {
  if (notificationsForceMock()) return 'mock';
  if (!process.env.WATI_API_TOKEN) return 'mock';
  if (!process.env.WATI_API_ENDPOINT) return 'misconfigured';
  return 'live';
}

export function getEmailChannel(): Channel {
  if (notificationsForceMock()) return 'mock';
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return 'mock';
  return 'live';
}

function smsDetail(): string | undefined {
  if (notificationsForceMock()) return 'NOTIFICATIONS_FORCE_MOCK is enabled';
  if (!process.env.MSG91_API_KEY) return 'Set MSG91_API_KEY for production SMS';
  if (getSmsChannel() === 'misconfigured') {
    return 'Set MSG91_TEMPLATE_ID_POD and MSG91_SENDER_ID. Optionally set MSG91_TEMPLATE_ID_OTP for a dedicated OTP template (otherwise raw message is used).';
  }
  return undefined;
}

function whatsappDetail(): string | undefined {
  if (notificationsForceMock()) return 'NOTIFICATIONS_FORCE_MOCK is enabled';
  if (!process.env.WATI_API_TOKEN) return 'Set WATI_API_TOKEN for production WhatsApp';
  if (getWhatsAppChannel() === 'misconfigured') return 'Set WATI_API_ENDPOINT (base URL for your WATI account)';
  return undefined;
}

function emailDetail(): string | undefined {
  if (notificationsForceMock()) return 'NOTIFICATIONS_FORCE_MOCK is enabled';
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return 'Set SMTP_USER and SMTP_PASS for outbound email';
  return undefined;
}

export function getNotificationIntegrationStatus() {
  return {
    forceMock: notificationsForceMock(),
    channels: {
      sms: { state: getSmsChannel(), detail: smsDetail() },
      whatsapp: { state: getWhatsAppChannel(), detail: whatsappDetail() },
      email: { state: getEmailChannel(), detail: emailDetail() },
    },
  };
}

export function isSmsMockSend(): boolean {
  return getSmsChannel() !== 'live';
}

export function isWhatsAppMockSend(): boolean {
  return getWhatsAppChannel() !== 'live';
}

export function isEmailMockSend(): boolean {
  return getEmailChannel() !== 'live';
}
