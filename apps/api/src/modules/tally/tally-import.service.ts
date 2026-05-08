import type { PrismaClient } from '@prisma/client';
import { POStatus } from '@prisma/client';

/** Shape of each flattened line from tally-bridge pull/orders (see pull-orders.ts). */
export interface TallyPurchaseOrderLine {
  orderRef?: string;
  date?: string;
  partyName?: string;
  itemName?: string;
  quantity?: number;
  unit?: string;
  amount?: number;
  voucherType?: string;
  raw?: Record<string, unknown>;
}

export interface TallyPartyRow {
  name: string;
  alias?: string;
  group?: string;
  parent?: string;
}

export interface TallyStockItem {
  name: string;
  sku?: string;
  category?: string;
  unit?: string;
  mrp?: number;
  quantity?: number;
  partNumber?: string;
  piecesPerBox?: number;
}

export interface PullOrdersBridgeResponse {
  success?: boolean;
  orders?: TallyPurchaseOrderLine[];
  count?: number;
  reportUsed?: string;
  note?: string;
  tallyErrors?: string[];
  pulledAt?: string;
}

function safeClientCode(name: string, suffix: string): string {
  const base = name
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 24)
    .toUpperCase();
  return `TL_${base || 'PARTY'}_${suffix.slice(0, 6)}`;
}

/** Upsert clients from Tally party list (bridge /pull/parties response shape). */
export async function syncPartiesToClients(
  prisma: PrismaClient,
  bridgeBody: { parties?: TallyPartyRow[]; count?: number },
  adminId?: string,
): Promise<{ created: number; updated: number }> {
  const parties = bridgeBody.parties ?? [];
  let created = 0;
  let updated = 0;
  const placeholder = { line1: '', city: '', state: '', pincode: '' };

  for (let i = 0; i < parties.length; i++) {
    const p = parties[i];
    if (!p?.name?.trim()) continue;
    const code = safeClientCode(p.name, String(i + 1000));
    const existing = await prisma.client.findFirst({
      where: { OR: [{ name: p.name }, { clientCode: code }] },
    });
    if (existing) {
      await prisma.client.update({
        where: { id: existing.id },
        data: { name: p.name },
      });
      updated++;
    } else {
      await prisma.client.create({
        data: {
          clientCode: code,
          name: p.name,
          phone: '+910000000000',
          billingAddress: placeholder,
          shippingAddress: placeholder,
          isActive: true,
        },
      });
      created++;
    }
  }

  void adminId;
  return { created, updated };
}

async function loadVariantMap(prisma: PrismaClient): Promise<Record<string, string>> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'TALLY_VARIANT_MAP' } });
  if (!row?.value) return {};
  try {
    return JSON.parse(row.value) as Record<string, string>;
  } catch {
    return {};
  }
}

async function resolveVariantId(
  prisma: PrismaClient,
  itemName: string | undefined,
  map: Record<string, string>,
): Promise<string | null> {
  if (!itemName?.trim()) return null;
  const trimmed = itemName.trim();
  if (map[trimmed]) return map[trimmed];

  const variants = await prisma.productVariant.findMany({
    where: { isActive: true },
    include: { product: true },
    take: 800,
  });

  const needle = trimmed.toLowerCase();
  for (const v of variants) {
    const sku = v.product.sku.toLowerCase();
    const label = `${v.product.name} ${v.colourName}`.toLowerCase();
    if (needle.includes(sku) || label.includes(needle) || needle.includes(label.substring(0, Math.min(12, label.length)))) {
      return v.id;
    }
  }
  return null;
}

async function findOrCreateClientForParty(prisma: PrismaClient, partyName: string | undefined): Promise<string> {
  const name = (partyName || 'Unknown Party').trim() || 'Unknown Party';
  const existing = await prisma.client.findFirst({ where: { name } });
  if (existing) return existing.id;
  const code = safeClientCode(name, String(Date.now()).slice(-6));
  const placeholder = { line1: '', city: '', state: '', pincode: '' };
  const c = await prisma.client.create({
    data: {
      clientCode: code,
      name,
      phone: '+910000000000',
      billingAddress: placeholder,
      shippingAddress: placeholder,
      isActive: true,
    },
  });
  return c.id;
}

function sanitizePoNumber(orderRef: string, party: string): string {
  const raw = `TL-${orderRef}-${party}`.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
  return raw.slice(0, 80);
}

/**
 * Groups Tally order lines by voucher reference and upserts PurchaseOrder + POLineItem.
 */
export async function applyPullOrdersToDatabase(
  prisma: PrismaClient,
  body: PullOrdersBridgeResponse,
  adminId: string | undefined,
): Promise<{ ordersUpserted: number; linesSkipped: number; warnings: string[] }> {
  const orders = body.orders ?? [];
  const warnings: string[] = [];
  if (!adminId) {
    warnings.push('No active ADMIN user — skipping PO import');
    return { ordersUpserted: 0, linesSkipped: orders.length, warnings };
  }

  const map = await loadVariantMap(prisma);
  const groups = new Map<string, TallyPurchaseOrderLine[]>();
  for (const line of orders) {
    const ref = line.orderRef || 'UNKNOWN';
    const key = `${ref}::${line.partyName || ''}`;
    const arr = groups.get(key) ?? [];
    arr.push(line);
    groups.set(key, arr);
  }

  let ordersUpserted = 0;
  let linesSkipped = 0;

  for (const [, lines] of groups) {
    const head = lines[0];
    const orderRef = head.orderRef || `REF-${Date.now()}`;
    const partyName = head.partyName;
    const clientId = await findOrCreateClientForParty(prisma, partyName);
    const poNumber = sanitizePoNumber(orderRef, partyName || 'x');
    const orderDate = head.date ? new Date(head.date) : new Date();

    const existing = await prisma.purchaseOrder.findFirst({
      where: { OR: [{ tallyVoucherId: orderRef }, { poNumber }] },
    });

    const lineCreates: Array<{
      variantId: string;
      orderedBoxes: number;
      orderedPieces: number;
      ratePerBoxPaise: number;
      gstPercent: number;
      totalAmountPaise: number;
    }> = [];

    for (const li of lines) {
      const vid = await resolveVariantId(prisma, li.itemName, map);
      if (!vid) {
        linesSkipped++;
        warnings.push(`No variant match for Tally line: ${li.itemName ?? '(no name)'} (order ${orderRef})`);
        continue;
      }
      const variant = await prisma.productVariant.findUnique({
        where: { id: vid },
        include: { product: true },
      });
      if (!variant) {
        linesSkipped++;
        continue;
      }
      const boxes = Math.max(1, Math.round(li.quantity ?? 1));
      const pieces = boxes * variant.product.piecesPerBox;
      const amountPaise = Math.round((li.amount ?? 0) * 100);
      lineCreates.push({
        variantId: vid,
        orderedBoxes: boxes,
        orderedPieces: pieces,
        ratePerBoxPaise: Math.max(0, Math.round(amountPaise / Math.max(1, boxes))),
        gstPercent: 18,
        totalAmountPaise: Math.max(0, amountPaise),
      });
    }

    if (lineCreates.length === 0) {
      continue;
    }

    const totalAmountPaise = lineCreates.reduce((s, l) => s + l.totalAmountPaise, 0);

    if (existing) {
      await prisma.pOLineItem.deleteMany({ where: { poId: existing.id } });
      await prisma.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          clientId,
          orderDate,
          totalAmountPaise,
          status: POStatus.CONFIRMED,
          tallyVoucherId: orderRef,
          updatedById: adminId,
          lineItems: {
            create: lineCreates,
          },
        },
      });
    } else {
      await prisma.purchaseOrder.create({
        data: {
          poNumber,
          clientId,
          orderDate,
          status: POStatus.CONFIRMED,
          totalAmountPaise,
          tallyVoucherId: orderRef,
          createdById: adminId,
          lineItems: {
            create: lineCreates,
          },
        },
      });
    }
    ordersUpserted++;
  }

  return { ordersUpserted, linesSkipped, warnings };
}

/**
 * Upserts products and variants from Tally stock item list.
 */
export async function syncStockItemsToProducts(
  prisma: PrismaClient,
  items: TallyStockItem[],
  adminId?: string,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const item of items) {
    if (!item.name?.trim()) continue;

    // 1. Resolve Category
    const categoryName = item.category || 'General';
    const slug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const category = await prisma.productCategory.upsert({
      where: { slug },
      create: { name: categoryName, slug },
      update: { name: categoryName },
    });

    // 2. Resolve SKU
    const sku = (item.partNumber || item.sku || item.name.split(' ')[0] || 'SKU-UNK').toUpperCase();

    // 3. Upsert Product
    const piecesPerBox = item.piecesPerBox || 1;
    const existingProduct = await prisma.product.findUnique({ where: { sku } });

    let product;
    if (existingProduct) {
      product = await prisma.product.update({
        where: { id: existingProduct.id },
        data: {
          name: item.name,
          categoryId: category.id,
          unitOfMeasure: item.unit || 'BOX',
          piecesPerBox,
        },
      });
      updated++;
    } else {
      product = await prisma.product.create({
        data: {
          sku,
          name: item.name,
          categoryId: category.id,
          unitOfMeasure: item.unit || 'BOX',
          piecesPerBox,
          status: 'ACTIVE',
        },
      });
      created++;
    }

    // 4. Resolve Variant (Assume 1:1 for Tally Stock Item if no specific variants provided)
    // In SmartLoad, variants usually have colour/dimensions. 
    // If Tally just gives "PVC Sheet 4mm Blue", we treat it as one variant.
    const barcodeValue = sku; // Simplified: Use SKU as barcode if none provided
    const mrpPaise = Math.round((item.mrp || 0) * 100);

    const variant = await prisma.productVariant.upsert({
      where: { barcodeValue },
      create: {
        productId: product.id,
        colourCode: 'STD',
        colourName: 'Standard',
        barcodeValue,
        mrpPaise,
        status: 'ACTIVE',
      },
      update: {
        mrpPaise,
      },
    });

    // 5. Update InventoryStock (Closing Balance from Tally)
    if (typeof item.quantity === 'number') {
      await prisma.inventoryStock.upsert({
        where: { variantId: variant.id },
        create: {
          variantId: variant.id,
          totalBoxes: item.quantity,
          reservedBoxes: 0,
        },
        update: {
          totalBoxes: item.quantity,
        },
      });
    }
  }

  void adminId;
  return { created, updated };
}
