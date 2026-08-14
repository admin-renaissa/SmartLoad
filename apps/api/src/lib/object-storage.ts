import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

function s3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL;
  return new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'minio',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'minioadmin',
    },
  });
}

/**
 * Upload a private object; returns HTTPS URL if S3_PUBLIC_BASE_URL set, else s3://bucket/key.
 */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const bucket = process.env.AWS_S3_BUCKET || 'smartload';
  await s3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key.replace(/^\//, ''),
      Body: body,
      ContentType: contentType,
    }),
  );
  const base = process.env.S3_PUBLIC_BASE_URL || process.env.APP_BASE_URL;
  if (base) {
    return `${base.replace(/\/$/, '')}/files/${encodeURI(key)}`;
  }
  return `s3://${bucket}/${key}`;
}

/** Data URL (png/jpeg) → buffer + content-type */
export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const contentType = m[1] || 'image/png';
  const buffer = Buffer.from(m[2], 'base64');
  return { buffer, contentType };
}
