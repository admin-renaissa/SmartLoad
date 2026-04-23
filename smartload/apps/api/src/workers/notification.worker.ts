import { Worker, type Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { QUEUES } from '@smartload/shared';
import nodemailer from 'nodemailer';
import axios from 'axios';

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
    POD_DISPATCH: `Your order {poNumber} has been dispatched. Vehicle: {vehicleReg}. Acknowledge delivery: {podUrl} (valid 72hrs)`,
    POD_OTP: `Your SmartLoad delivery OTP is {otp}. Valid for {expiryMinutes} minutes. Do not share.`,
    LOW_STOCK: `⚠ Low stock alert: {productName} {colourName} — {availableBoxes} boxes remaining.`,
  };

  let message = templates[type] || type;
  for (const [key, value] of Object.entries(variables)) {
    message = message.replaceAll(`{${key}}`, value);
  }
  return message;
}

async function sendSMS(phone: string, message: string) {
  if (!process.env.MSG91_API_KEY) {
    console.log(`[SMS MOCK] To: ${phone} | ${message}`);
    return { messageId: `mock-${Date.now()}` };
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
  if (!process.env.WATI_API_TOKEN) {
    console.log(`[WhatsApp MOCK] To: ${phone} | Template: ${templateName}`);
    return { id: `mock-${Date.now()}` };
  }

  const response = await axios.post(
    `${process.env.WATI_API_ENDPOINT}/api/v1/sendTemplateMessage`,
    {
      whatsappNumber: phone.replace('+91', ''),
      template_name: templateName,
      broadcast_name: templateName,
      parameters: Object.entries(variables).map(([, value]) => ({ name: 'value', value })),
    },
    {
      headers: { Authorization: `Bearer ${process.env.WATI_API_TOKEN}` },
    },
  );
  return response.data;
}

async function sendEmail(to: string, subject: string, html: string) {
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
  const worker = new Worker(
    QUEUES.NOTIFICATIONS,
    async (job: Job<NotificationJob>) => {
      const { channel, recipientPhone, recipientEmail, type, variables } = job.data;
      const message = buildMessage(type, variables);

      const notification = await prisma.notification.create({
        data: {
          recipientPhone: recipientPhone || '',
          recipientEmail,
          channel,
          type,
          status: 'PROCESSING',
          payload: variables as Record<string, string>,
        },
      });

      try {
        let externalId: string | undefined;

        if (channel === 'SMS' && recipientPhone) {
          const result = await sendSMS(recipientPhone, message);
          externalId = (result as { messageId?: string }).messageId;
        } else if (channel === 'WHATSAPP' && recipientPhone) {
          const result = await sendWhatsApp(recipientPhone, type.toLowerCase().replace(/_/g, '-'), variables);
          externalId = (result as { id?: string }).id;
        } else if (channel === 'EMAIL' && recipientEmail) {
          await sendEmail(recipientEmail, `SmartLoad: ${type}`, `<p>${message}</p>`);
        }

        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'SENT', sentAt: new Date(), externalId },
        });
      } catch (err) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'FAILED', failedReason: err instanceof Error ? err.message : 'Unknown error' },
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
