-- CreateTable
CREATE TABLE "scanner_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "ipAddress" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "registeredById" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanner_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scanner_devices_serialNumber_key" ON "scanner_devices"("serialNumber");

-- CreateIndex
CREATE INDEX "scanner_devices_serialNumber_idx" ON "scanner_devices"("serialNumber");

-- CreateIndex
CREATE INDEX "scanner_devices_driverName_idx" ON "scanner_devices"("driverName");

-- CreateIndex
CREATE INDEX "scanner_devices_isActive_idx" ON "scanner_devices"("isActive");

-- AddForeignKey
ALTER TABLE "scanner_devices" ADD CONSTRAINT "scanner_devices_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
