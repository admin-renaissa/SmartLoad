export enum PODStatus {
  PENDING = 'PENDING',
  LINK_SENT = 'LINK_SENT',
  OTP_VERIFIED = 'OTP_VERIFIED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  DISPUTED = 'DISPUTED',
  EXPIRED = 'EXPIRED',
}

export interface ProofOfDelivery {
  id: string;
  sessionId: string;
  linkToken: string;
  linkExpiresAt: string;
  otp?: string | null;
  otpExpiresAt?: string | null;
  status: PODStatus;
  receiverName?: string | null;
  receiverPhone?: string | null;
  signatureImageUrl?: string | null;
  acknowledgedAt?: string | null;
  geoLat?: number | null;
  geoLng?: number | null;
  discrepancyNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PODLineItem {
  id: string;
  podId: string;
  lineItemId: string;
  deliveredBoxes: number;
  acknowledgedBoxes: number;
  discrepancyBoxes: number;
  discrepancyReason?: string | null;
  createdAt: string;
}
