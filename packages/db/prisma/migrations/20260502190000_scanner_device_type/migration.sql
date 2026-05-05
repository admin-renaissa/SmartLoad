-- AlterTable: add deviceType column to scanner_devices
ALTER TABLE "scanner_devices" ADD COLUMN "deviceType" TEXT NOT NULL DEFAULT 'BARCODE_SCANNER';
