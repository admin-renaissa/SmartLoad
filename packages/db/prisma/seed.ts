import {
  PrismaClient,
  UserRole,
  POStatus,
  SessionStatus,
  ScanResult,
  VehicleType,
  MovementType,
  PODStatus,
  NotificationChannel,
  NotificationStatus,
  TallySyncDirection,
  TallySyncStatus,
  TallySyncDataType,
  BarcodeFormat,
  Prisma,
} from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

/** Matches API / shared `Address` shape (JSON on Client). */
type SeedAddress = {
  line1: string
  line2?: string
  city: string
  state: string
  pincode: string
  country: string
}

function lineTotalPaise(orderedBoxes: number, ratePerBoxPaise: number, gstPercent: number): number {
  const sub = orderedBoxes * ratePerBoxPaise
  return Math.round(sub * (1 + gstPercent / 100))
}

function mkAddress(seed: number): SeedAddress {
  const locales = [
    { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
    { city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    { city: 'Ahmedabad', state: 'Gujarat', pincode: '380001' },
    { city: 'Surat', state: 'Gujarat', pincode: '395001' },
    { city: 'Bangalore', state: 'Karnataka', pincode: '560001' },
    { city: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
    { city: 'Hyderabad', state: 'Telangana', pincode: '500001' },
    { city: 'Delhi', state: 'Delhi', pincode: '110001' },
    { city: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
    { city: 'Indore', state: 'Madhya Pradesh', pincode: '452001' },
  ]
  const loc = locales[seed % locales.length]
  return {
    line1: `${100 + (seed % 90)} MIDC Industrial Area, Block ${String.fromCharCode(65 + (seed % 5))}`,
    line2: seed % 2 === 0 ? `Near Highway NH-${48 + (seed % 5)}` : undefined,
    city: loc.city,
    state: loc.state,
    pincode: loc.pincode,
    country: 'India',
  }
}

async function clearTransactionalData(): Promise<void> {
  await prisma.$transaction([
    prisma.scanEvent.deleteMany(),
    prisma.pODLineItem.deleteMany(),
    prisma.proofOfDelivery.deleteMany(),
    prisma.dispatchSession.deleteMany(),
    prisma.pOLineItem.deleteMany(),
    prisma.purchaseOrder.deleteMany(),
    prisma.gRNLineItem.deleteMany(),
    prisma.goodsReceiptNote.deleteMany(),
    prisma.inventoryLedger.deleteMany(),
    prisma.inventoryStock.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.productCategory.deleteMany(),
    prisma.client.deleteMany(),
    prisma.vehicle.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.tallySyncJob.deleteMany(),
  ])
}

async function main(): Promise<void> {
  console.log('🌱 Starting seed...')

  // ── System Config ──────────────────────────────────────────────────────────
  const configs = [
    { key: 'COMPANY_NAME', value: 'Your Company Pvt Ltd', description: 'Company display name' },
    { key: 'COMPANY_GSTIN', value: '27AAAAA0000A1Z5', description: 'Company GSTIN' },
    { key: 'COMPANY_ADDRESS', value: 'Mumbai, Maharashtra, India', description: 'Company address' },
    { key: 'COMPANY_PHONE', value: '+91 9000000000', description: 'Company contact number' },
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

  const demoHash = await bcrypt.hash('Demo@123', 12)

  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@smartload.in' },
    update: {
      passwordHash: demoHash,
      name: 'Rajesh Kumar',
      role: UserRole.SUPERVISOR,
      phone: '+91 9000000002',
      isActive: true,
    },
    create: {
      email: 'supervisor@smartload.in',
      passwordHash: demoHash,
      name: 'Rajesh Kumar',
      role: UserRole.SUPERVISOR,
      phone: '+91 9000000002',
      isActive: true,
    },
  })

  const operator = await prisma.user.upsert({
    where: { email: 'operator@smartload.in' },
    update: {
      passwordHash: demoHash,
      name: 'Suresh Patil',
      role: UserRole.OPERATOR,
      phone: '+91 9000000003',
      isActive: true,
    },
    create: {
      email: 'operator@smartload.in',
      passwordHash: demoHash,
      name: 'Suresh Patil',
      role: UserRole.OPERATOR,
      phone: '+91 9000000003',
      isActive: true,
    },
  })

  const accounts = await prisma.user.upsert({
    where: { email: 'accounts@smartload.in' },
    update: {
      passwordHash: demoHash,
      name: 'Priya Sharma',
      role: UserRole.ACCOUNTS,
      phone: '+91 9000000004',
      isActive: true,
    },
    create: {
      email: 'accounts@smartload.in',
      passwordHash: demoHash,
      name: 'Priya Sharma',
      role: UserRole.ACCOUNTS,
      phone: '+91 9000000004',
      isActive: true,
    },
  })

  await prisma.user.upsert({
    where: { email: 'driver@smartload.in' },
    update: {
      passwordHash: demoHash,
      name: 'Manoj Singh',
      role: UserRole.DRIVER,
      phone: '+91 9000000005',
      isActive: true,
    },
    create: {
      email: 'driver@smartload.in',
      passwordHash: demoHash,
      name: 'Manoj Singh',
      role: UserRole.DRIVER,
      phone: '+91 9000000005',
      isActive: true,
    },
  })

  await prisma.user.upsert({
    where: { email: 'client@smartload.in' },
    update: {
      passwordHash: demoHash,
      name: 'Demo Client Portal',
      role: UserRole.CLIENT,
      phone: '+91 9000000006',
      isActive: true,
    },
    create: {
      email: 'client@smartload.in',
      passwordHash: demoHash,
      name: 'Demo Client Portal',
      role: UserRole.CLIENT,
      phone: '+91 9000000006',
      isActive: true,
    },
  })

  // Extra CLIENT users (portal testers) — 8 more → 10 CLIENT-role rows incl. demo
  const clientUsers = [
    { email: 'client.retail@smartload.in', name: 'Retail Traders Co.', phone: '+91 9010000001' },
    { email: 'client.wholesale@smartload.in', name: 'Wholesale Hub LLP', phone: '+91 9010000002' },
    { email: 'client.builder@smartload.in', name: 'Metro Builders Ltd', phone: '+91 9010000003' },
    { email: 'client.interiors@smartload.in', name: 'Fine Interiors Pvt Ltd', phone: '+91 9010000004' },
    { email: 'client.hardware@smartload.in', name: 'City Hardware Mart', phone: '+91 9010000005' },
    { email: 'client.project@smartload.in', name: 'Turnkey Projects Inc', phone: '+91 9010000006' },
    { email: 'client.exports@smartload.in', name: 'Exports Desk', phone: '+91 9010000007' },
    { email: 'client.expo@smartload.in', name: 'Expo Laminates', phone: '+91 9010000008' },
  ]
  for (const u of clientUsers) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, phone: u.phone, role: UserRole.CLIENT, passwordHash: demoHash, isActive: true },
      create: { ...u, role: UserRole.CLIENT, passwordHash: demoHash, isActive: true },
    })
  }

  console.log(`✅ Users seeded (admin + staff + ${clientUsers.length + 1} client portal users)`)

  await clearTransactionalData()
  console.log('✅ Cleared transactional tables (orders, inventory rows, clients, vehicles, …)')

  // ── Product Categories (10) ────────────────────────────────────────────────
  const categoryDefs = [
    { name: 'PVC Sheets', slug: 'pvc-sheets', description: 'Rigid PVC flat sheets' },
    { name: 'PVC Panels', slug: 'pvc-panels', description: 'Wall and ceiling panels' },
    { name: 'PVC Profiles', slug: 'pvc-profiles', description: 'Channels, trims, corners' },
    { name: 'WPC Boards', slug: 'wpc-boards', description: 'Wood–plastic composite boards' },
    { name: 'ACP Sheets', slug: 'acp-sheets', description: 'Aluminium composite panels' },
    { name: 'Adhesives', slug: 'adhesives', description: 'Bonding and fixing products' },
    { name: 'Hardware & Fasteners', slug: 'hardware-fasteners', description: 'Screws, clips, brackets' },
    { name: 'Ceiling Systems', slug: 'ceiling-systems', description: 'Grid and tile systems' },
    { name: 'Flooring', slug: 'flooring', description: 'Vinyl and allied flooring' },
    { name: 'Packaging Consumables', slug: 'packaging', description: 'Stretch wrap, corner guards' },
  ]

  const categories: Record<string, { id: string }> = {}
  for (const cat of categoryDefs) {
    const row = await prisma.productCategory.create({
      data: { ...cat, isActive: true },
    })
    categories[cat.slug] = row
  }
  console.log(`✅ ${categoryDefs.length} product categories`)

  // ── Products + variants + stock ────────────────────────────────────────────
  type VariantSeed = {
    colourCode: string
    colourName: string
    lengthMm: number
    widthMm: number
    thicknessMm: number
    mrpPaise: number
    /** If set, used as barcodeValue (legacy demo QR payloads). */
    barcodeJson?: Record<string, unknown>
  }

  const productDefs: Array<{
    sku: string
    name: string
    categorySlug: string
    hsnCode: string
    piecesPerBox: number
    weightPerBoxKg: number
    minStockAlert: number
    variants: VariantSeed[]
  }> = [
    {
      sku: 'PVC-4X8-3MM',
      name: 'PVC Sheet 4x8 ft 3mm',
      categorySlug: 'pvc-sheets',
      hsnCode: '39204990',
      piecesPerBox: 10,
      weightPerBoxKg: 12.5,
      minStockAlert: 20,
      variants: [
        {
          colourCode: 'WHT',
          colourName: 'White',
          lengthMm: 2440,
          widthMm: 1220,
          thicknessMm: 3,
          mrpPaise: 150000,
          barcodeJson: {
            sku: 'PVC-4X8-3MM',
            variantId: 'demo-1',
            colourCode: 'WHT',
            colourName: 'White',
            lengthMm: 2440,
            widthMm: 1220,
            thicknessMm: 3,
            piecesPerBox: 10,
          },
        },
        {
          colourCode: 'IVR',
          colourName: 'Ivory',
          lengthMm: 2440,
          widthMm: 1220,
          thicknessMm: 3,
          mrpPaise: 155000,
          barcodeJson: {
            sku: 'PVC-4X8-3MM',
            variantId: 'demo-2',
            colourCode: 'IVR',
            colourName: 'Ivory',
            lengthMm: 2440,
            widthMm: 1220,
            thicknessMm: 3,
            piecesPerBox: 10,
          },
        },
        {
          colourCode: 'GRY',
          colourName: 'Grey',
          lengthMm: 2440,
          widthMm: 1220,
          thicknessMm: 3,
          mrpPaise: 155000,
          barcodeJson: {
            sku: 'PVC-4X8-3MM',
            variantId: 'demo-3',
            colourCode: 'GRY',
            colourName: 'Grey',
            lengthMm: 2440,
            widthMm: 1220,
            thicknessMm: 3,
            piecesPerBox: 10,
          },
        },
      ],
    },
    ...Array.from({ length: 9 }, (_, i) => {
      const idx = i + 1
      const slug = ['pvc-panels', 'pvc-profiles', 'wpc-boards', 'acp-sheets', 'pvc-sheets'][
        i % 5
      ]!
      const sku = `SKU-${String(200 + idx).padStart(4, '0')}`
      const colours = [
        { code: 'NAT', name: 'Natural', mrp: 120000 + idx * 1000 },
        { code: 'TEK', name: 'Teak', mrp: 125000 + idx * 1000 },
        { code: 'WAL', name: 'Walnut', mrp: 128000 + idx * 1000 },
      ]
      return {
        sku,
        name: `Catalog Product ${idx} (${slug.split('-').join(' ')})`,
        categorySlug: slug,
        hsnCode: '39204990',
        piecesPerBox: 8 + (idx % 4),
        weightPerBoxKg: 10 + idx * 0.5,
        minStockAlert: 15 + idx,
        variants: colours.map((c, j) => ({
          colourCode: `${c.code}-${idx}`,
          colourName: c.name,
          lengthMm: 2440 - j * 10,
          widthMm: 1220,
          thicknessMm: 4 + (j % 2),
          mrpPaise: c.mrp,
        })),
      }
    }),
  ]

  const variantIds: string[] = []

  for (const p of productDefs) {
    const cat = categories[p.categorySlug]
    if (!cat) throw new Error(`Missing category ${p.categorySlug}`)

    const product = await prisma.product.create({
      data: {
        sku: p.sku,
        name: p.name,
        categoryId: cat.id,
        hsnCode: p.hsnCode,
        unitOfMeasure: 'BOX',
        piecesPerBox: p.piecesPerBox,
        weightPerBoxKg: p.weightPerBoxKg,
        minStockAlert: p.minStockAlert,
        isActive: true,
      },
    })

    let vIdx = 0
    for (const v of p.variants) {
      const barcodeValue =
        v.barcodeJson != null
          ? JSON.stringify(v.barcodeJson)
          : JSON.stringify({
              sku: p.sku,
              seedVariantKey: `${p.sku}-${v.colourCode}-${v.thicknessMm}-${vIdx}`,
              colourCode: v.colourCode,
              colourName: v.colourName,
              lengthMm: v.lengthMm,
              widthMm: v.widthMm,
              thicknessMm: v.thicknessMm,
              piecesPerBox: p.piecesPerBox,
            })

      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          colourCode: v.colourCode,
          colourName: v.colourName,
          lengthMm: v.lengthMm,
          widthMm: v.widthMm,
          thicknessMm: v.thicknessMm,
          barcodeValue,
          barcodeFormat: BarcodeFormat.QR,
          mrpPaise: v.mrpPaise,
          isActive: true,
        },
      })
      variantIds.push(variant.id)

      const stockBoxes = 55 + ((variantIds.length * 17) % 145)
      await prisma.inventoryStock.create({
        data: {
          variantId: variant.id,
          totalBoxes: stockBoxes,
          reservedBoxes: Math.min(5, Math.floor(stockBoxes / 10)),
        },
      })
      vIdx += 1
    }
  }

  console.log(`✅ ${productDefs.length} products, ${variantIds.length} variants + inventory_stock`)

  // ── Clients (15) ───────────────────────────────────────────────────────────
  const gstPool = [
    '27AAAAA0000A1Z5',
    '29AABCU9603R1ZX',
    '24AABCU9603R1ZX',
    '33AAACU9603R1ZX',
    '09AAACU9603R1ZX',
    '07AAACU9603R1ZX',
    '19AAACU9603R1ZX',
    '23AAACU9603R1ZX',
  ]

  const clients: { id: string; clientCode: string }[] = []
  for (let i = 1; i <= 15; i++) {
    const billing = mkAddress(i)
    const shipping =
      i % 4 === 0
        ? mkAddress(i + 50)
        : { ...billing }
    const c = await prisma.client.create({
      data: {
        clientCode: `CLI-${String(i).padStart(4, '0')}`,
        name: `Trade Partner ${i} ${['Pvt Ltd', 'LLP', 'Enterprises', 'Traders'][i % 4]}`,
        gstin: gstPool[i % gstPool.length] ?? null,
        phone: `+9198765${String(10000 + i).slice(1)}`,
        email: `billing.partner${i}@example.in`,
        billingAddress: billing as unknown as Prisma.InputJsonValue,
        shippingAddress: shipping as unknown as Prisma.InputJsonValue,
        contactPersonName: `Contact Person ${i}`,
        isActive: true,
      },
    })
    clients.push({ id: c.id, clientCode: c.clientCode })
  }
  console.log(`✅ ${clients.length} clients`)

  // ── Vehicles (12) ──────────────────────────────────────────────────────────
  const vehicleTypes = [
    VehicleType.TRUCK,
    VehicleType.TEMPO,
    VehicleType.VAN,
    VehicleType.MINI_TRUCK,
    VehicleType.PICKUP,
    VehicleType.CONTAINER,
  ]
  const vehicles: { id: string; registrationNumber: string }[] = []
  for (let i = 1; i <= 12; i++) {
    const reg = `MH${String(10 + (i % 20)).padStart(2, '0')}XX${String(1000 + i)}`
    const v = await prisma.vehicle.create({
      data: {
        registrationNumber: reg,
        type: vehicleTypes[(i - 1) % vehicleTypes.length]!,
        capacityKg: 3500 + i * 250,
        driverName: `Driver ${i}`,
        driverPhone: `+9187654${String(20000 + i).slice(1)}`,
        isActive: i !== 12,
      },
    })
    vehicles.push(v)
  }
  console.log(`✅ ${vehicles.length} vehicles`)

  // ── Purchase orders (15) + line items (~45) ────────────────────────────────
  const poStatuses: POStatus[] = [
    POStatus.DRAFT,
    POStatus.DRAFT,
    POStatus.CONFIRMED,
    POStatus.CONFIRMED,
    POStatus.CONFIRMED,
    POStatus.PARTIALLY_LOADED,
    POStatus.PARTIALLY_LOADED,
    POStatus.FULLY_LOADED,
    POStatus.FULLY_LOADED,
    POStatus.DISPATCHED,
    POStatus.DISPATCHED,
    POStatus.DELIVERED,
    POStatus.CLOSED,
    POStatus.CANCELLED,
    POStatus.CONFIRMED,
  ]

  const createdPOs: {
    id: string
    poNumber: string
    status: POStatus
    lineItemIds: string[]
    variantIdsOnPo: string[]
  }[] = []

  for (let i = 0; i < 15; i++) {
    const client = clients[i % clients.length]!
    const pickVariants = [
      variantIds[i % variantIds.length]!,
      variantIds[(i + 7) % variantIds.length]!,
      variantIds[(i + 14) % variantIds.length]!,
    ]

    const lines: Prisma.POLineItemCreateWithoutPurchaseOrderInput[] = []
    let poTotal = 0
    const gst = 18
    for (let li = 0; li < 3; li++) {
      const variantId = pickVariants[li]!
      const productRow = await prisma.productVariant.findUnique({
        where: { id: variantId },
        include: { product: true },
      })
      const piecesPerBox = productRow?.product.piecesPerBox ?? 10
      const orderedBoxes = 5 + ((i + li * 3) % 12)
      const orderedPieces = orderedBoxes * piecesPerBox
      const ratePerBoxPaise = 480000 + li * 12000 + i * 500
      const totalAmountPaise = lineTotalPaise(orderedBoxes, ratePerBoxPaise, gst)
      poTotal += totalAmountPaise

      const loadedBoxes =
        poStatuses[i] === POStatus.DISPATCHED ||
        poStatuses[i] === POStatus.DELIVERED ||
        poStatuses[i] === POStatus.CLOSED
          ? orderedBoxes
          : poStatuses[i] === POStatus.PARTIALLY_LOADED
            ? Math.floor(orderedBoxes / 2)
            : 0

      lines.push({
        variant: { connect: { id: variantId } },
        orderedBoxes,
        orderedPieces,
        ratePerBoxPaise,
        gstPercent: gst,
        totalAmountPaise,
        loadedBoxes,
        loadedPieces: loadedBoxes * piecesPerBox,
      })
    }

    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-2026-${String(i + 1).padStart(4, '0')}`,
        clientId: client.id,
        orderDate: new Date(Date.UTC(2026, 0, 5 + i)),
        expectedDispatchDate: new Date(Date.UTC(2026, 1, 10 + i)),
        status: poStatuses[i]!,
        totalAmountPaise: poTotal,
        notes: i % 3 === 0 ? 'Handle with care — fragile edges.' : null,
        tallyVoucherId: i % 5 === 0 ? `TALLY-VO-${1000 + i}` : null,
        createdById: admin.id,
        updatedById: accounts.id,
        lineItems: { create: lines },
      },
      include: { lineItems: true },
    })

    createdPOs.push({
      id: po.id,
      poNumber: po.poNumber,
      status: po.status,
      lineItemIds: po.lineItems.map((x) => x.id),
      variantIdsOnPo: pickVariants,
    })
  }
  console.log(`✅ ${createdPOs.length} purchase orders with ${createdPOs.length * 3} line items`)

  // ── GRNs (8) + lines (~24) + ledger INWARD ─────────────────────────────────
  const grns: { id: string; grnNumber: string }[] = []
  for (let g = 1; g <= 8; g++) {
    const lineCreates: Prisma.GRNLineItemCreateWithoutGrnInput[] = []
    for (let k = 0; k < 3; k++) {
      const variantId = variantIds[(g * 3 + k) % variantIds.length]!
      const pv = await prisma.productVariant.findUnique({
        where: { id: variantId },
        include: { product: true },
      })
      const piecesPerBox = pv?.product.piecesPerBox ?? 10
      const boxes = 8 + ((g + k) % 10)
      lineCreates.push({
        variant: { connect: { id: variantId } },
        receivedBoxes: boxes,
        receivedPieces: boxes * piecesPerBox,
      })
    }

    const grn = await prisma.goodsReceiptNote.create({
      data: {
        grnNumber: `GRN-2026-${String(g).padStart(4, '0')}`,
        receivedDate: new Date(Date.UTC(2026, 2, g)),
        notes: g % 2 === 0 ? 'QC checked — OK' : null,
        tallyVoucherId: g % 3 === 0 ? `TALLY-GRN-${g}` : null,
        createdById: admin.id,
        lineItems: { create: lineCreates },
      },
      include: { lineItems: true },
    })
    grns.push({ id: grn.id, grnNumber: grn.grnNumber })

    for (const li of grn.lineItems) {
      await prisma.inventoryLedger.create({
        data: {
          variantId: li.variantId,
          movementType: MovementType.INWARD,
          boxes: li.receivedBoxes,
          pieces: li.receivedPieces,
          referenceType: 'GRN',
          referenceId: grn.id,
          notes: `Receipt ${grn.grnNumber}`,
          createdById: admin.id,
        },
      })
    }
  }
  console.log(`✅ ${grns.length} GRNs + GRN-linked ledger rows`)

  // ── Dispatch sessions (6) + scan events ────────────────────────────────────
  const sessionScenario = [
    { poIndex: 9, status: SessionStatus.CLOSED, scannedFrac: 1 },
    { poIndex: 10, status: SessionStatus.CLOSED, scannedFrac: 1 },
    { poIndex: 11, status: SessionStatus.OPEN, scannedFrac: 0.4 },
    { poIndex: 7, status: SessionStatus.PAUSED, scannedFrac: 0.55 },
    { poIndex: 8, status: SessionStatus.CLOSED, scannedFrac: 1 },
    { poIndex: 14, status: SessionStatus.OPEN, scannedFrac: 0 },
  ] as const

  const sessions: { id: string; poLineItemIds: string[]; variantIds: string[] }[] = []

  let sNum = 1
  for (const sc of sessionScenario) {
    const po = createdPOs[sc.poIndex]!
    const veh = vehicles[sNum % vehicles.length]!
    const sumBoxes = await prisma.pOLineItem.aggregate({
      where: { poId: po.id },
      _sum: { orderedBoxes: true },
    })
    const expected = sumBoxes._sum.orderedBoxes ?? 0
    const scanned = Math.floor(expected * sc.scannedFrac)

    const session = await prisma.dispatchSession.create({
      data: {
        sessionCode: `SES-2026-${String(sNum).padStart(4, '0')}`,
        poId: po.id,
        vehicleId: veh.id,
        supervisorId: supervisor.id,
        operatorId: operator.id,
        status: sc.status,
        openedAt: new Date(Date.UTC(2026, 3, sNum)),
        closedAt:
          sc.status === SessionStatus.CLOSED ? new Date(Date.UTC(2026, 3, sNum, 18)) : null,
        totalBoxesExpected: expected,
        totalBoxesScanned: scanned,
        notes: sNum % 2 === 0 ? 'Evening shift dispatch' : null,
        isPartialDispatch: sc.scannedFrac > 0 && sc.scannedFrac < 1,
        partialReason:
          sc.scannedFrac > 0 && sc.scannedFrac < 1 ? 'Vehicle capacity split across trips' : null,
        inventoryDeducted: sc.status === SessionStatus.CLOSED && sc.scannedFrac >= 1,
        tallySynced: sc.status === SessionStatus.CLOSED && sNum % 2 === 0,
        podCreated: false,
      },
    })

    sessions.push({
      id: session.id,
      poLineItemIds: po.lineItemIds,
      variantIds: po.variantIdsOnPo,
    })

    // Scan events (sample SUCCESS / one DUPLICATE for variety)
    const scanCount = Math.min(24, Math.max(3, scanned + 2))
    for (let z = 0; z < scanCount; z++) {
      const variantId = po.variantIdsOnPo[z % po.variantIdsOnPo.length]!
      const pv = await prisma.productVariant.findUnique({ where: { id: variantId } })
      await prisma.scanEvent.create({
        data: {
          sessionId: session.id,
          operatorId: operator.id,
          scannedBarcode: pv?.barcodeValue ?? 'UNKNOWN',
          resolvedVariantId: z % 11 === 0 ? null : variantId,
          result: z % 11 === 0 ? ScanResult.UNKNOWN_BARCODE : ScanResult.SUCCESS,
          errorReason: z % 11 === 0 ? 'No matching catalogue row' : null,
          deviceId: `ZEBRA-${100 + (z % 3)}`,
          scannedAt: new Date(Date.UTC(2026, 3, sNum, 9 + (z % 8), z % 60)),
        },
      })
    }
    sNum += 1
  }
  console.log(`✅ ${sessions.length} dispatch sessions + scan events`)

  // ── Inventory ledger extras (OUTWARD / ADJUSTMENT) ─────────────────────────
  const ledgerExtras: Array<{
    variantId: string
    movementType: MovementType
    boxes: number
    pieces: number
    referenceType: string
    referenceId: string
    notes: string
  }> = []

  for (let i = 0; i < 12; i++) {
    ledgerExtras.push({
      variantId: variantIds[i % variantIds.length]!,
      movementType: i % 4 === 0 ? MovementType.ADJUSTMENT_SUB : MovementType.OUTWARD,
      boxes: 1 + (i % 3),
      pieces: (1 + (i % 3)) * 10,
      referenceType: 'SEED_AUDIT',
      referenceId: `ADJ-${i}`,
      notes: i % 4 === 0 ? 'Cycle count correction' : 'Sample outward movement',
    })
  }

  for (const row of ledgerExtras) {
    await prisma.inventoryLedger.create({
      data: { ...row, createdById: accounts.id },
    })
  }
  console.log(`✅ ${ledgerExtras.length} extra inventory_ledger rows`)

  // ── Notifications (10) ─────────────────────────────────────────────────────
  for (let n = 1; n <= 10; n++) {
    await prisma.notification.create({
      data: {
        recipientPhone: `+9198111${String(10000 + n).slice(1)}`,
        recipientEmail: n % 2 === 0 ? `notify${n}@example.in` : null,
        channel: n % 3 === 0 ? NotificationChannel.EMAIL : NotificationChannel.SMS,
        type: n % 2 === 0 ? 'POD_DISPATCH' : 'LOW_STOCK',
        status:
          n % 4 === 0
            ? NotificationStatus.FAILED
            : n % 3 === 0
              ? NotificationStatus.SENT
              : NotificationStatus.PENDING,
        payload: { ref: `PO-2026-${String(n).padStart(4, '0')}`, boxes: 10 + n } as Prisma.InputJsonValue,
        sentAt: n % 3 === 0 ? new Date() : null,
        failedReason: n % 4 === 0 ? 'Carrier timeout' : null,
        retryCount: n % 4 === 0 ? 2 : 0,
      },
    })
  }
  console.log('✅ 10 notifications')

  // ── Tally sync jobs (10) ───────────────────────────────────────────────────
  const tallyTypes = [
    TallySyncDataType.DISPATCH_OUTWARD,
    TallySyncDataType.GRN_INWARD,
    TallySyncDataType.PULL_STOCK_ITEMS,
    TallySyncDataType.PULL_PARTIES,
    TallySyncDataType.PULL_ORDERS,
    TallySyncDataType.RECONCILIATION,
  ]
  for (let t = 1; t <= 10; t++) {
    await prisma.tallySyncJob.create({
      data: {
        direction: t % 2 === 0 ? TallySyncDirection.PULL : TallySyncDirection.PUSH,
        dataType: tallyTypes[(t - 1) % tallyTypes.length]!,
        status:
          t % 5 === 0
            ? TallySyncStatus.FAILED
            : t % 3 === 0
              ? TallySyncStatus.COMPLETED
              : TallySyncStatus.PENDING,
        referenceId: `REF-${200 + t}`,
        tallyVoucherId: t % 3 === 0 ? `TV-${300 + t}` : null,
        requestPayload: { batch: t, items: t * 3 } as Prisma.InputJsonValue,
        responsePayload:
          t % 3 === 0 ? ({ ok: true, lines: t * 2 } as Prisma.InputJsonValue) : undefined,
        errorMessage: t % 5 === 0 ? 'Connection reset by Tally bridge' : null,
        attempts: t % 5 === 0 ? 3 : 0,
        nextRetryAt: t % 5 === 0 ? new Date(Date.now() + 3600_000) : null,
        processedAt: t % 3 === 0 ? new Date() : null,
      },
    })
  }
  console.log('✅ 10 tally_sync_jobs')

  // ── Audit logs (8) ───────────────────────────────────────────────────────
  for (let a = 1; a <= 8; a++) {
    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        userEmail: admin.email,
        userRole: UserRole.ADMIN,
        action: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN'][a % 4]!,
        resourceType: ['PurchaseOrder', 'Client', 'Product', 'DispatchSession'][a % 4]!,
        resourceId: `seed-res-${a}`,
        oldValues: a % 2 === 0 ? ({ status: 'DRAFT' } as Prisma.InputJsonValue) : undefined,
        newValues: { status: 'CONFIRMED', actor: 'seed' } as Prisma.InputJsonValue,
        ipAddress: `192.168.1.${100 + a}`,
        userAgent: 'SmartLoad-Seed/1.0',
      },
    })
  }
  console.log('✅ 8 audit_logs')

  // ── Proof of delivery (2) + pod_line_items ─────────────────────────────────
  const closedRich = sessions.filter((_, idx) => sessionScenario[idx]?.status === SessionStatus.CLOSED)
  for (let p = 0; p < Math.min(2, closedRich.length); p++) {
    const sess = closedRich[p]!
    const poMeta = createdPOs.find((x) => x.lineItemIds.some((id) => sess.poLineItemIds.includes(id)))
    if (!poMeta) continue

    const pod = await prisma.proofOfDelivery.create({
      data: {
        sessionId: sess.id,
        linkExpiresAt: new Date(Date.UTC(2026, 5, 30)),
        otpHash: null,
        otpExpiresAt: null,
        status: p === 0 ? PODStatus.ACKNOWLEDGED : PODStatus.LINK_SENT,
        receiverName: `Receiver ${p + 1}`,
        receiverPhone: `+9199222${String(30000 + p).slice(1)}`,
        acknowledgedAt: p === 0 ? new Date(Date.UTC(2026, 4, 2)) : null,
        geoLat: 19.076 + p * 0.01,
        geoLng: 72.8777 + p * 0.01,
        discrepancyNotes: null,
      },
    })

    await prisma.dispatchSession.update({
      where: { id: sess.id },
      data: { podCreated: true },
    })

    for (let li = 0; li < Math.min(3, sess.poLineItemIds.length); li++) {
      const lineItemId = sess.poLineItemIds[li]!
      const liRow = await prisma.pOLineItem.findUnique({ where: { id: lineItemId } })
      const boxes = liRow?.orderedBoxes ?? 1
      await prisma.pODLineItem.create({
        data: {
          podId: pod.id,
          lineItemId,
          deliveredBoxes: boxes,
          acknowledgedBoxes: p === 0 ? boxes : 0,
          discrepancyBoxes: 0,
        },
      })
    }
  }
  console.log('✅ Up to 2 proof_of_delivery records + pod_line_items')

  console.log('')
  console.log('🎉 Seed complete!')
  console.log('')
  console.log('  Summary (approximate counts):')
  console.log(`    categories: ${categoryDefs.length}, products: ${productDefs.length}, variants: ${variantIds.length}`)
  console.log(`    clients: ${clients.length}, vehicles: ${vehicles.length}`)
  console.log(`    POs: ${createdPOs.length}, PO lines: ${createdPOs.length * 3}`)
  console.log(`    GRNs: ${grns.length}, sessions: ${sessions.length}, notifications: 10, tally jobs: 10`)
  console.log('')
  console.log('  Login (unchanged):')
  console.log('    Admin:      admin@smartload.in       / Admin@123')
  console.log('    Supervisor: supervisor@smartload.in  / Demo@123')
  console.log('    Operator:   operator@smartload.in    / Demo@123')
  console.log('    Accounts:   accounts@smartload.in    / Demo@123')
  console.log('    Client:     client@smartload.in      / Demo@123')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
