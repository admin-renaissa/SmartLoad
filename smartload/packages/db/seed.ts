import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Admin user
  const passwordHash = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@smartload.in' },
    update: {},
    create: {
      email: 'admin@smartload.in',
      passwordHash,
      name: 'System Admin',
      role: UserRole.ADMIN,
      phone: '+919999999999',
    },
  });
  console.log('✅ Admin user:', admin.email);

  // Demo supervisor
  const supervisorHash = await bcrypt.hash('Supervisor@123', 12);
  await prisma.user.upsert({
    where: { email: 'supervisor@smartload.in' },
    update: {},
    create: {
      email: 'supervisor@smartload.in',
      passwordHash: supervisorHash,
      name: 'Rajesh Sharma',
      role: UserRole.SUPERVISOR,
      phone: '+919888888888',
    },
  });

  // Demo operator
  const operatorHash = await bcrypt.hash('Operator@123', 12);
  await prisma.user.upsert({
    where: { email: 'operator@smartload.in' },
    update: {},
    create: {
      email: 'operator@smartload.in',
      passwordHash: operatorHash,
      name: 'Suresh Kumar',
      role: UserRole.OPERATOR,
      phone: '+919777777777',
    },
  });

  // Demo accounts
  const accountsHash = await bcrypt.hash('Accounts@123', 12);
  await prisma.user.upsert({
    where: { email: 'accounts@smartload.in' },
    update: {},
    create: {
      email: 'accounts@smartload.in',
      passwordHash: accountsHash,
      name: 'Priya Patel',
      role: UserRole.ACCOUNTS,
      phone: '+919666666666',
    },
  });

  console.log('✅ Demo users created');

  // Product categories
  const categories = [
    { name: 'PVC Sheets', slug: 'pvc-sheets', description: 'PVC foam and rigid sheets in all sizes' },
    { name: 'Accessories', slug: 'accessories', description: 'Edge trims, joiners, and installation accessories' },
    { name: 'Panels', slug: 'panels', description: 'Wall and ceiling panels' },
    { name: 'Profiles', slug: 'profiles', description: 'PVC extrusion profiles and sections' },
    { name: 'Other', slug: 'other', description: 'Miscellaneous products' },
  ];

  for (const cat of categories) {
    await prisma.productCategory.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log('✅ Product categories created');

  // System config
  const configs = [
    { key: 'COMPANY_NAME', value: 'Your Company Pvt Ltd', description: 'Company display name' },
    { key: 'COMPANY_GSTIN', value: '27AABCU9603R1ZX', description: 'Company GST registration number' },
    { key: 'COMPANY_ADDRESS', value: 'Plot No. 1, Industrial Area, Mumbai, Maharashtra 400001', description: 'Company address for documents' },
    { key: 'COMPANY_PHONE', value: '+912212345678', description: 'Company contact number' },
    { key: 'TALLY_COMPANY_NAME', value: 'Your Company Pvt Ltd', description: 'Exact company name in TallyPrime' },
    { key: 'LOW_STOCK_ALERT_BOXES', value: '10', description: 'Trigger low stock alert when available boxes fall below this' },
    { key: 'SCANNER_DRIVER', value: 'hid-keyboard', description: 'Default scanner driver: hid-keyboard | serial | zebra-datawedge' },
    { key: 'SCAN_TIMEOUT_MS', value: '500', description: 'Maximum scan processing time in milliseconds' },
    { key: 'AUDIO_ALERTS_ENABLED', value: 'true', description: 'Enable/disable audio beeps on scan' },
    { key: 'DEFAULT_LANGUAGE', value: 'en', description: 'Default UI language: en | hi' },
    { key: 'TALLY_GODOWN_NAME', value: 'Main Warehouse', description: 'Default godown name in Tally for stock movements' },
    { key: 'TALLY_SYNC_INTERVAL_MINUTES', value: '15', description: 'Automatic Tally pull interval in minutes' },
    { key: 'SMS_ENABLED', value: 'true', description: 'Enable SMS notifications' },
    { key: 'WHATSAPP_ENABLED', value: 'true', description: 'Enable WhatsApp notifications' },
    { key: 'EMAIL_ENABLED', value: 'true', description: 'Enable email notifications' },
    { key: 'LOW_STOCK_NOTIFICATION_EMAILS', value: 'admin@smartload.in', description: 'Comma-separated emails for low stock alerts' },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: { ...config, updatedById: admin.id },
    });
  }
  console.log('✅ System config created');

  // Demo client
  await prisma.client.upsert({
    where: { clientCode: 'CLI-001' },
    update: {},
    create: {
      clientCode: 'CLI-001',
      name: 'Amit Traders',
      gstin: '27AABCT1234R1Z5',
      phone: '+919555555555',
      email: 'amit@amittraders.com',
      billingAddress: {
        line1: '42 Market Road',
        line2: 'Near Bus Stand',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
      },
      shippingAddress: {
        line1: '42 Market Road',
        line2: 'Near Bus Stand',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
      },
      contactPersonName: 'Amit Desai',
    },
  });
  console.log('✅ Demo client created');

  // Demo vehicle
  await prisma.vehicle.upsert({
    where: { registrationNumber: 'MH-12-AB-1234' },
    update: {},
    create: {
      registrationNumber: 'MH-12-AB-1234',
      type: 'TRUCK',
      capacityKg: 5000,
      driverName: 'Ramesh Yadav',
      driverPhone: '+919444444444',
    },
  });
  console.log('✅ Demo vehicle created');

  // Demo product with variants
  const pvcSheetsCat = await prisma.productCategory.findUnique({ where: { slug: 'pvc-sheets' } });
  if (pvcSheetsCat) {
    const product = await prisma.product.upsert({
      where: { sku: 'PVC-4X8-3MM' },
      update: {},
      create: {
        sku: 'PVC-4X8-3MM',
        name: 'PVC Sheet 4x8 ft 3mm',
        categoryId: pvcSheetsCat.id,
        hsnCode: '3921',
        unitOfMeasure: 'BOX',
        piecesPerBox: 12,
        weightPerBoxKg: 18.5,
        minStockAlert: 10,
      },
    });

    const variants = [
      { colourCode: 'WHT', colourName: 'White', length: 2440, width: 1220, thickness: 3, mrp: 240000 },
      { colourCode: 'IVR', colourName: 'Ivory', length: 2440, width: 1220, thickness: 3, mrp: 245000 },
      { colourCode: 'GRY', colourName: 'Grey', length: 2440, width: 1220, thickness: 3, mrp: 245000 },
    ];

    for (const v of variants) {
      const barcodeValue = `${product.sku}-${v.colourCode}-L${v.length}-W${v.width}-T${v.thickness}`;
      const variant = await prisma.productVariant.upsert({
        where: { barcodeValue },
        update: {},
        create: {
          productId: product.id,
          colourCode: v.colourCode,
          colourName: v.colourName,
          length: v.length,
          width: v.width,
          thickness: v.thickness,
          barcodeValue,
          barcodeFormat: 'QR',
          mrp: v.mrp,
        },
      });

      // Initialize inventory stock
      await prisma.inventoryStock.upsert({
        where: { variantId: variant.id },
        update: {},
        create: {
          variantId: variant.id,
          totalBoxes: 50,
          reservedBoxes: 0,
        },
      });

      // Initial inward ledger entry
      const existingLedger = await prisma.inventoryLedger.findFirst({
        where: { variantId: variant.id, referenceType: 'SEED' },
      });
      if (!existingLedger) {
        await prisma.inventoryLedger.create({
          data: {
            variantId: variant.id,
            movementType: 'INWARD',
            boxes: 50,
            pieces: 50 * product.piecesPerBox,
            referenceType: 'SEED',
            referenceId: 'SEED-001',
            notes: 'Initial stock from seed',
            createdById: admin.id,
          },
        });
      }
    }
    console.log('✅ Demo product with variants and stock created');
  }

  console.log('\n🎉 Seed complete!');
  console.log('\n📋 Login credentials:');
  console.log('   Admin:      admin@smartload.in      / Admin@123');
  console.log('   Supervisor: supervisor@smartload.in / Supervisor@123');
  console.log('   Operator:   operator@smartload.in   / Operator@123');
  console.log('   Accounts:   accounts@smartload.in   / Accounts@123');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
