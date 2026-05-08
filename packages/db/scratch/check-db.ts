import { PrismaClient } from '@prisma/client';

async function check() {
  const prisma = new PrismaClient();
  try {
    const all = await prisma.product.findMany();
    console.log('Total products in DB:', all.length);
    if (all.length > 0) {
      console.log('Sample product:', JSON.stringify(all[0], null, 2));
    }
  } catch (err) {
    console.error('Error fetching products:', err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
