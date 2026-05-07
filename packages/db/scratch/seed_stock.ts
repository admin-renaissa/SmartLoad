import { PrismaClient, ProductStatus } from '../generated/client/index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching category...');
  let category = await prisma.productCategory.findFirst();
  if (!category) {
    category = await prisma.productCategory.create({
      data: {
        name: 'Seed Category',
        slug: 'seed-category-' + Date.now(),
      }
    });
  }

  console.log('Creating 5 Low Stock Products...');
  for (let i = 1; i <= 5; i++) {
    const sku = `LOW-STOCK-${Date.now()}-${i}`;
    await prisma.product.create({
      data: {
        sku,
        name: `Low Stock Item ${i}`,
        categoryId: category.id,
        piecesPerBox: 10,
        minStockAlert: 20, // Low stock threshold
        status: ProductStatus.ACTIVE,
        variants: {
          create: {
            colourCode: 'RED',
            colourName: 'Red',
            barcodeValue: `${sku}-RED`,
            inventoryStock: {
              create: {
                totalBoxes: 10, // 10 < 20, so it's low stock
                reservedBoxes: 0,
              }
            }
          }
        }
      }
    });
  }

  console.log('Creating 5 Out of Stock Products...');
  for (let i = 1; i <= 5; i++) {
    const sku = `OUT-STOCK-${Date.now()}-${i}`;
    await prisma.product.create({
      data: {
        sku,
        name: `Out of Stock Item ${i}`,
        categoryId: category.id,
        piecesPerBox: 10,
        minStockAlert: 10,
        status: ProductStatus.ACTIVE,
        variants: {
          create: {
            colourCode: 'BLU',
            colourName: 'Blue',
            barcodeValue: `${sku}-BLU`,
            inventoryStock: {
              create: {
                totalBoxes: 0, // 0 <= 0, so out of stock
                reservedBoxes: 0,
              }
            }
          }
        }
      }
    });
  }

  console.log('Creating 5 Archived Products...');
  for (let i = 1; i <= 5; i++) {
    const sku = `ARCHIVED-${Date.now()}-${i}`;
    await prisma.product.create({
      data: {
        sku,
        name: `Archived Item ${i}`,
        categoryId: category.id,
        piecesPerBox: 10,
        minStockAlert: 10,
        status: ProductStatus.ARCHIVED,
        isActive: false,
        variants: {
          create: {
            colourCode: 'GRN',
            colourName: 'Green',
            barcodeValue: `${sku}-GRN`,
            status: ProductStatus.ARCHIVED,
            isActive: false,
            inventoryStock: {
              create: {
                totalBoxes: 50, // Doesn't matter, it's archived
                reservedBoxes: 0,
              }
            }
          }
        }
      }
    });
  }

  console.log('Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
