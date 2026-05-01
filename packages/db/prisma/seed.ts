import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main(): Promise<void> {
  console.log('🌱 Starting seed...')

  // ── System Config ──────────────────────────────────────────────────────────
  const configs = [
    { key: 'COMPANY_NAME', value: 'Your Company Pvt Ltd', description: 'Company display name' },
    { key: 'COMPANY_GSTIN', value: '27XXXXX0000X1ZX', description: 'Company GSTIN' },
    { key: 'COMPANY_ADDRESS', value: 'Mumbai, Maharashtra, India', description: 'Company address' },
    { key: 'COMPANY_PHONE', value: '+91 98XXXXXXXX', description: 'Company contact number' },
    { key: 'COMPANY_EMAIL', value: 'info@yourcompany.in', description: 'Company email' },
    { key: 'TALLY_COMPANY_NAME', value: 'Your Company Pvt Ltd', description: 'Company name as in Tally' },
    { key: 'TALLY_GODOWN_NAME', value: 'Main Godown', description: 'Tally godown for stock' },
    { key: 'LOW_STOCK_ALERT_BOXES', value: '10', description: 'Alert when stock below this' },
    { key: 'SCANNER_DRIVER', value: 'hid-keyboard', description: 'Active scanner driver' },
    { key: 'SCAN_AUDIO_ENABLED', value: 'true', description: 'Play audio on scan result' },
    { key: 'APP_LANGUAGE', value: 'en', description: 'UI language: en | hi' },
  ]

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: { value: config.value, description: config.description },
      create: { key: config.key, value: config.value, description: config.description },
    })
  }
  console.log('✅ System config seeded')

  // ── Admin User ─────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@smartload.in' },
    update: {
      passwordHash: adminPassword,
      name: 'System Administrator',
      role: UserRole.ADMIN,
      phone: '+91 9000000001',
      isActive: true,
    },
    create: {
      email: 'admin@smartload.in',
      passwordHash: adminPassword,
      name: 'System Administrator',
      role: UserRole.ADMIN,
      phone: '+91 9000000001',
      isActive: true,
    },
  })
  console.log(`✅ Admin user: ${admin.email}`)

  // ── Demo Users ─────────────────────────────────────────────────────────────
  const demoUsers = [
    { email: 'supervisor@smartload.in', name: 'Rajesh Kumar', role: UserRole.SUPERVISOR, phone: '+91 9000000002' },
    { email: 'operator@smartload.in', name: 'Suresh Patil', role: UserRole.OPERATOR, phone: '+91 9000000003' },
    { email: 'accounts@smartload.in', name: 'Priya Sharma', role: UserRole.ACCOUNTS, phone: '+91 9000000004' },
    { email: 'driver@smartload.in', name: 'Manoj Singh', role: UserRole.DRIVER, phone: '+91 9000000005' },
  ]
  for (const u of demoUsers) {
    const hash = await bcrypt.hash('Demo@123', 12)
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        passwordHash: hash,
        name: u.name,
        role: u.role,
        phone: u.phone,
        isActive: true,
      },
      create: { ...u, passwordHash: hash, isActive: true },
    })
  }
  console.log('✅ Demo users seeded (password: Demo@123)')

  const clientHash = await bcrypt.hash('Demo@123', 12)
  await prisma.user.upsert({
    where: { email: 'client@smartload.in' },
    update: {
      passwordHash: clientHash,
      name: 'Demo Client Portal',
      role: UserRole.CLIENT,
      phone: '+91 9000000006',
      isActive: true,
    },
    create: {
      email: 'client@smartload.in',
      passwordHash: clientHash,
      name: 'Demo Client Portal',
      role: UserRole.CLIENT,
      phone: '+91 9000000006',
      isActive: true,
    },
  })
  console.log('✅ Client portal user: client@smartload.in (password: Demo@123)')

  // ── Product Categories ─────────────────────────────────────────────────────
  const categories = [
    { name: 'PVC Sheets', slug: 'pvc-sheets', description: 'All PVC flat sheet products' },
    { name: 'PVC Panels', slug: 'pvc-panels', description: 'Wall and ceiling panel products' },
    { name: 'PVC Profiles', slug: 'pvc-profiles', description: 'Edge trims, channels, and profiles' },
    { name: 'Accessories', slug: 'accessories', description: 'Adhesives, clips, and fitting accessories' },
    { name: 'Other', slug: 'other', description: 'Miscellaneous products' },
  ]
  for (const cat of categories) {
    await prisma.productCategory.upsert({
      where: { slug: cat.slug },
      update: { description: cat.description },
      create: { ...cat, isActive: true },
    })
  }
  console.log('✅ Product categories seeded')

  // ── Demo Products & Variants ───────────────────────────────────────────────
  const pvcCat = await prisma.productCategory.findUnique({ where: { slug: 'pvc-sheets' } })
  if (pvcCat) {
    const product = await prisma.product.upsert({
      where: { sku: 'PVC-4X8-3MM' },
      update: {},
      create: {
        sku: 'PVC-4X8-3MM',
        name: 'PVC Sheet 4x8 ft 3mm',
        categoryId: pvcCat.id,
        hsnCode: '39204990',
        unitOfMeasure: 'BOX',
        piecesPerBox: 10,
        weightPerBoxKg: 12.5,
        minStockAlert: 20,
        isActive: true,
      },
    })

    const variants = [
      {
        colourCode: 'WHT',
        colourName: 'White',
        barcodeValue: JSON.stringify({
          sku: 'PVC-4X8-3MM',
          variantId: 'demo-1',
          colourCode: 'WHT',
          colourName: 'White',
          lengthMm: 2440,
          widthMm: 1220,
          thicknessMm: 3,
          piecesPerBox: 10,
        }),
        mrpPaise: 150000,
      },
      {
        colourCode: 'IVR',
        colourName: 'Ivory',
        barcodeValue: JSON.stringify({
          sku: 'PVC-4X8-3MM',
          variantId: 'demo-2',
          colourCode: 'IVR',
          colourName: 'Ivory',
          lengthMm: 2440,
          widthMm: 1220,
          thicknessMm: 3,
          piecesPerBox: 10,
        }),
        mrpPaise: 155000,
      },
      {
        colourCode: 'GRY',
        colourName: 'Grey',
        barcodeValue: JSON.stringify({
          sku: 'PVC-4X8-3MM',
          variantId: 'demo-3',
          colourCode: 'GRY',
          colourName: 'Grey',
          lengthMm: 2440,
          widthMm: 1220,
          thicknessMm: 3,
          piecesPerBox: 10,
        }),
        mrpPaise: 155000,
      },
    ]

    for (const v of variants) {
      const variant = await prisma.productVariant.upsert({
        where: { barcodeValue: v.barcodeValue },
        update: {},
        create: {
          productId: product.id,
          colourCode: v.colourCode,
          colourName: v.colourName,
          lengthMm: 2440,
          widthMm: 1220,
          thicknessMm: 3,
          barcodeValue: v.barcodeValue,
          barcodeFormat: 'QR',
          mrpPaise: v.mrpPaise,
          isActive: true,
        },
      })
      await prisma.inventoryStock.upsert({
        where: { variantId: variant.id },
        update: {},
        create: { variantId: variant.id, totalBoxes: 100, reservedBoxes: 0 },
      })
    }
    console.log('✅ Demo products and variants seeded with initial stock')
  }

  console.log('🎉 Seed complete!')
  console.log('')
  console.log('  Login credentials:')
  console.log('  Admin:      admin@smartload.in    / Admin@123')
  console.log('  Supervisor: supervisor@smartload.in / Demo@123')
  console.log('  Operator:   operator@smartload.in   / Demo@123')
  console.log('  Accounts:   accounts@smartload.in   / Demo@123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
