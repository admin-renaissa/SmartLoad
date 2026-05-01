-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SUPERVISOR', 'OPERATOR', 'ACCOUNTS', 'DRIVER');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PARTIALLY_LOADED', 'FULLY_LOADED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'PAUSED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('SUCCESS', 'WRONG_PRODUCT', 'WRONG_COLOUR', 'EXCESS_QUANTITY', 'UNKNOWN_BARCODE', 'DUPLICATE_SCAN', 'SESSION_CLOSED');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INWARD', 'OUTWARD', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN_INWARD');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TRUCK', 'TEMPO', 'VAN', 'MINI_TRUCK', 'PICKUP', 'CONTAINER');

-- CreateEnum
CREATE TYPE "PODStatus" AS ENUM ('PENDING', 'LINK_SENT', 'OTP_VERIFIED', 'ACKNOWLEDGED', 'DISPUTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TallySyncDirection" AS ENUM ('PUSH', 'PULL');

-- CreateEnum
CREATE TYPE "TallySyncStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PERMANENTLY_FAILED');

-- CreateEnum
CREATE TYPE "TallySyncDataType" AS ENUM ('DISPATCH_OUTWARD', 'GRN_INWARD', 'PULL_STOCK_ITEMS', 'PULL_PARTIES', 'PULL_ORDERS', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "BarcodeFormat" AS ENUM ('QR', 'CODE128', 'CODE39', 'DATAMATRIX', 'EAN13', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'DELIVERED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "hsnCode" TEXT,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'BOX',
    "piecesPerBox" INTEGER NOT NULL,
    "weightPerBoxKg" DOUBLE PRECISION,
    "minStockAlert" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "colourCode" TEXT NOT NULL,
    "colourName" TEXT NOT NULL,
    "lengthMm" DOUBLE PRECISION,
    "widthMm" DOUBLE PRECISION,
    "thicknessMm" DOUBLE PRECISION,
    "barcodeValue" TEXT NOT NULL,
    "barcodeFormat" "BarcodeFormat" NOT NULL DEFAULT 'QR',
    "imageUrl" TEXT,
    "mrpPaise" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "billingAddress" JSONB NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "contactPersonName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "expectedDispatchDate" TIMESTAMP(3),
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmountPaise" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "tallyVoucherId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_line_items" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "orderedBoxes" INTEGER NOT NULL,
    "orderedPieces" INTEGER NOT NULL,
    "ratePerBoxPaise" INTEGER NOT NULL,
    "gstPercent" DOUBLE PRECISION NOT NULL DEFAULT 18,
    "totalAmountPaise" INTEGER NOT NULL,
    "loadedBoxes" INTEGER NOT NULL DEFAULT 0,
    "loadedPieces" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "po_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "capacityKg" DOUBLE PRECISION,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatch_sessions" (
    "id" TEXT NOT NULL,
    "sessionCode" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "operatorId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "totalBoxesExpected" INTEGER NOT NULL,
    "totalBoxesScanned" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isPartialDispatch" BOOLEAN NOT NULL DEFAULT false,
    "partialReason" TEXT,
    "inventoryDeducted" BOOLEAN NOT NULL DEFAULT false,
    "tallySynced" BOOLEAN NOT NULL DEFAULT false,
    "podCreated" BOOLEAN NOT NULL DEFAULT false,
    "manifestPdfUrl" TEXT,
    "challanPdfUrl" TEXT,
    "tallyVoucherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "scannedBarcode" TEXT NOT NULL,
    "resolvedVariantId" TEXT,
    "result" "ScanResult" NOT NULL,
    "errorReason" TEXT,
    "deviceId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stock" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "totalBoxes" INTEGER NOT NULL DEFAULT 0,
    "reservedBoxes" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_ledger" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "movementType" "MovementType" NOT NULL,
    "boxes" INTEGER NOT NULL,
    "pieces" INTEGER NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_notes" (
    "id" TEXT NOT NULL,
    "grnNumber" TEXT NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "tallyVoucherId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goods_receipt_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_line_items" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "receivedBoxes" INTEGER NOT NULL,
    "receivedPieces" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grn_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_of_delivery" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "linkToken" TEXT NOT NULL,
    "linkExpiresAt" TIMESTAMP(3) NOT NULL,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "status" "PODStatus" NOT NULL DEFAULT 'PENDING',
    "receiverName" TEXT,
    "receiverPhone" TEXT,
    "signatureImageUrl" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "geoLat" DOUBLE PRECISION,
    "geoLng" DOUBLE PRECISION,
    "discrepancyNotes" TEXT,
    "podPdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proof_of_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pod_line_items" (
    "id" TEXT NOT NULL,
    "podId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "deliveredBoxes" INTEGER NOT NULL,
    "acknowledgedBoxes" INTEGER NOT NULL DEFAULT 0,
    "discrepancyBoxes" INTEGER NOT NULL DEFAULT 0,
    "discrepancyReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pod_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tally_sync_jobs" (
    "id" TEXT NOT NULL,
    "direction" "TallySyncDirection" NOT NULL,
    "dataType" "TallySyncDataType" NOT NULL,
    "status" "TallySyncStatus" NOT NULL DEFAULT 'PENDING',
    "referenceId" TEXT,
    "tallyVoucherId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tally_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "recipientEmail" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_slug_key" ON "product_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_sku_idx" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- CreateIndex
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_barcodeValue_key" ON "product_variants"("barcodeValue");

-- CreateIndex
CREATE INDEX "product_variants_barcodeValue_idx" ON "product_variants"("barcodeValue");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_isActive_idx" ON "product_variants"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_colourCode_lengthMm_widthMm_thic_key" ON "product_variants"("productId", "colourCode", "lengthMm", "widthMm", "thicknessMm");

-- CreateIndex
CREATE UNIQUE INDEX "clients_clientCode_key" ON "clients"("clientCode");

-- CreateIndex
CREATE INDEX "clients_clientCode_idx" ON "clients"("clientCode");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "clients_isActive_idx" ON "clients"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_clientId_idx" ON "purchase_orders"("clientId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_orderDate_idx" ON "purchase_orders"("orderDate");

-- CreateIndex
CREATE INDEX "purchase_orders_poNumber_idx" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "po_line_items_poId_idx" ON "po_line_items"("poId");

-- CreateIndex
CREATE INDEX "po_line_items_variantId_idx" ON "po_line_items"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registrationNumber_key" ON "vehicles"("registrationNumber");

-- CreateIndex
CREATE INDEX "vehicles_registrationNumber_idx" ON "vehicles"("registrationNumber");

-- CreateIndex
CREATE INDEX "vehicles_isActive_idx" ON "vehicles"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "dispatch_sessions_sessionCode_key" ON "dispatch_sessions"("sessionCode");

-- CreateIndex
CREATE INDEX "dispatch_sessions_poId_idx" ON "dispatch_sessions"("poId");

-- CreateIndex
CREATE INDEX "dispatch_sessions_vehicleId_idx" ON "dispatch_sessions"("vehicleId");

-- CreateIndex
CREATE INDEX "dispatch_sessions_status_idx" ON "dispatch_sessions"("status");

-- CreateIndex
CREATE INDEX "dispatch_sessions_openedAt_idx" ON "dispatch_sessions"("openedAt");

-- CreateIndex
CREATE INDEX "scan_events_sessionId_idx" ON "scan_events"("sessionId");

-- CreateIndex
CREATE INDEX "scan_events_result_idx" ON "scan_events"("result");

-- CreateIndex
CREATE INDEX "scan_events_scannedAt_idx" ON "scan_events"("scannedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_variantId_key" ON "inventory_stock"("variantId");

-- CreateIndex
CREATE INDEX "inventory_ledger_variantId_idx" ON "inventory_ledger"("variantId");

-- CreateIndex
CREATE INDEX "inventory_ledger_movementType_idx" ON "inventory_ledger"("movementType");

-- CreateIndex
CREATE INDEX "inventory_ledger_createdAt_idx" ON "inventory_ledger"("createdAt");

-- CreateIndex
CREATE INDEX "inventory_ledger_referenceType_referenceId_idx" ON "inventory_ledger"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipt_notes_grnNumber_key" ON "goods_receipt_notes"("grnNumber");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_grnNumber_idx" ON "goods_receipt_notes"("grnNumber");

-- CreateIndex
CREATE INDEX "goods_receipt_notes_receivedDate_idx" ON "goods_receipt_notes"("receivedDate");

-- CreateIndex
CREATE INDEX "grn_line_items_grnId_idx" ON "grn_line_items"("grnId");

-- CreateIndex
CREATE UNIQUE INDEX "proof_of_delivery_sessionId_key" ON "proof_of_delivery"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "proof_of_delivery_linkToken_key" ON "proof_of_delivery"("linkToken");

-- CreateIndex
CREATE INDEX "proof_of_delivery_linkToken_idx" ON "proof_of_delivery"("linkToken");

-- CreateIndex
CREATE INDEX "proof_of_delivery_status_idx" ON "proof_of_delivery"("status");

-- CreateIndex
CREATE INDEX "pod_line_items_podId_idx" ON "pod_line_items"("podId");

-- CreateIndex
CREATE INDEX "tally_sync_jobs_status_idx" ON "tally_sync_jobs"("status");

-- CreateIndex
CREATE INDEX "tally_sync_jobs_direction_dataType_idx" ON "tally_sync_jobs"("direction", "dataType");

-- CreateIndex
CREATE INDEX "tally_sync_jobs_nextRetryAt_idx" ON "tally_sync_jobs"("nextRetryAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_idx" ON "audit_logs"("resourceType");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_channel_idx" ON "notifications"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_line_items" ADD CONSTRAINT "po_line_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_sessions" ADD CONSTRAINT "dispatch_sessions_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_sessions" ADD CONSTRAINT "dispatch_sessions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_sessions" ADD CONSTRAINT "dispatch_sessions_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatch_sessions" ADD CONSTRAINT "dispatch_sessions_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dispatch_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_events" ADD CONSTRAINT "scan_events_resolvedVariantId_fkey" FOREIGN KEY ("resolvedVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stock" ADD CONSTRAINT "inventory_stock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_ledger" ADD CONSTRAINT "inventory_ledger_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_line_items" ADD CONSTRAINT "grn_line_items_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "goods_receipt_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_line_items" ADD CONSTRAINT "grn_line_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_of_delivery" ADD CONSTRAINT "proof_of_delivery_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "dispatch_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_line_items" ADD CONSTRAINT "pod_line_items_podId_fkey" FOREIGN KEY ("podId") REFERENCES "proof_of_delivery"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pod_line_items" ADD CONSTRAINT "pod_line_items_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "po_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
