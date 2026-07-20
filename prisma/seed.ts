import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../src/test-support/seed-data';

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await seedDatabase(prisma);
    // eslint-disable-next-line no-console
    console.log(`Seeded database (seedVersion=${result.seedVersion}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
