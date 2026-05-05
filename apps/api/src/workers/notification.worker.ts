import { Worker, type Job } from 'bullmq';
import { PrismaClient, NotificationChannel, NotificationStatus } from '@prisma/client';
import { QUEUES } from '@smartload/shared';
import nodemailer from 'nodemailer';
import axios from 'axios';
import {
  getNotificationIntegrationStatus,
  getSmsChannel,
  getWhatsAppChannel,
  isEmailMockSend,
  isSmsMockSend,
  isWhatsAppMockSend,
} from '../lib/notification-env.js';

const prisma = new PrismaClient();
const connection = {
  host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
  port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379'),
};

interface NotificationJob {
  channel: 'SMS' | 'WHATSAPP' | 'EMAIL';
  recipientPhone?: string;
  recipientEmail?: string;
  type: string;
  variables: Record<string, string>;
}

function buildMessage(type: string, variables: Record<string, string>): string {
  const templates: Record<string, string> = {
    POD_DISPATCH:
      `{companyName}: Order {poNumber} dispatched. Vehicle {vehicleReg}, driver {driverName} ({driverPhone}). Acknowledge: {podUrl} (72h).`,
    POD_OTP: `Your SmartLoad delivery OTP is {otp}. Valid for {expiryMinutes} minutes. Do not share.`,
    LOW_STOCK: `⚠ Low stock alert: {productName} {colourName} — {availableBoxes} boxes remaining.`,
    POD_ACK_ACCOUNTS: `POD {podId} acknowledged. PDF: {podPdfUrl}`,
  };

  let message = templates[type] || type;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replaceAll(`{${key}}`, value);
  }
  return message;
}

async function sendSMS(phone: string, message: string) {
  if (isSmsMockSend()) {
    console.log(`[SMS MOCK] To: ${phone} | ${message}`);
    return { messageId: `mock-${Date.now()}` };
  }
  if (getSmsChannel() === 'misconfigured') {
    throw new Error('MSG91 misconfiguration: set MSG91_TEMPLATE_ID_POD and MSG91_SENDER_ID');
  }

  const response = await axios.post(
    'https://api.msg91.com/api/v5/flow/',
    {
      template_id: process.env.MSG91_TEMPLATE_ID_POD,
      sender: process.env.MSG91_SENDER_ID,
      mobiles: phone.replace('+', ''),
      VAR1: message,
    },
    {
      headers: { authkey: process.env.MSG91_API_KEY, 'Content-Type': 'application/json' },
    },
  );
  return response.data;
}

async function sendWhatsApp(phone: string, templateName: string, variables: Record<string, string>) {
  if (isWhatsAppMockSend()) {
    console.log(`[WhatsApp MOCK] To: ${phone} | Template: ${templateName}`);
    return { id: `mock-${Date.now()}` };
  }
  if (getWhatsAppChannel() === 'misconfigured') {
    throw new Error('WATI misconfiguration: set WATI_API_ENDPOINT');
  }

  /** WATI templates: use variable keys as parameter names. Set WATI_WHATSAPP_INDEXED_PARAMS=true if the template uses {{1}}, {{2}}, … in order of Object.entries (stable only if job payloads keep key order). */
  const useIndexed = process.env.WATI_WHATSAPP_INDEXED_PARAMS === 'true';
  const entries = Object.entries(variables).map(([k, v]) => [k, String(v ?? '')] as const);
  const parameters = useIndexed
    ? entries.map(([, value], i) => ({ name: String(i + 1), value }))
    : entries.map(([name, value]) => ({ name, value }));

  const response = await axios.post(
    `${process.env.WATI_API_ENDPOINT}/api/v1/sendTemplateMessage`,
    {
      whatsappNumber: phone.replace('+91', ''),
      template_name: templateName,
      broadcast_name: templateName,
      parameters,
    },
    {
      headers: { Authorization: `Bearer ${process.env.WATI_API_TOKEN}` },
    },
  );
  return response.data;
}

async function sendEmail(to: string, subject: string, html: string) {
  if (isEmailMockSend()) {
    console.log(`[EMAIL MOCK] To: ${to} | ${subject}`);
    return { messageId: `mock-${Date.now()}` };
  }
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  return transporter.sendMail({
    from: process.env.EMAIL_FROM || 'SmartLoad <noreply@smartload.in>',
    to,
    subject,
    html,
  });
}

export function startNotificationWorker() {
  try {
    console.log('[NotificationWorker] channels:', JSON.stringify(getNotificationIntegrationStatus()));
  } catch {
    // ignore
  }
  const worker = new Worker(
    QUEUES.NOTIFICATIONS,
    async (job: Job<NotificationJob>) => {
      const { channel, recipientPhone, recipientEmail, type, variables } = job.data;
      const message = buildMessage(type, variables);

      const notification = await prisma.notification.create({
        data: {
          recipientPhone: recipientPhone ?? null,
          recipientEmail: recipientEmail ?? null,
          channel: channel as NotificationChannel,
          type,
          status: NotificationStatus.PENDING,
          payload: variables,
        },
      });

      try {
        let externalId: string | undefined;

        if (channel === 'SMS' && recipientPhone) {
          const result = await sendSMS(recipientPhone, message);
          externalId = (result as { messageId?: string }).messageId;
        } else if (channel === 'WHATSAPP' && recipientPhone) {
          const templateName =
            type === 'POD_DISPATCH' && process.env.WATI_TEMPLATE_POD_DISPATCH?.trim()
              ? process.env.WATI_TEMPLATE_POD_DISPATCH.trim()
              : type.toLowerCase().replace(/_/g, '-');
          const result = await sendWhatsApp(recipientPhone, templateName, variables);
          externalId = (result as { id?: string }).id;
        } else if (channel === 'EMAIL' && recipientEmail) {
          await sendEmail(recipientEmail, `SmartLoad: ${type}`, `<p>${message}</p>`);
        }

        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.SENT, sentAt: new Date(), externalId },
        });
      } catch (err) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: NotificationStatus.FAILED, failedReason: err instanceof Error ? err.message : 'Unknown error' },
        });
        throw err;
      }
    },
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    console.error(`[NotificationWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
