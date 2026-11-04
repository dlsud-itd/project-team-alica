import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new PrismaClient();

async function main() {
  const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
  const statements = seedSql
    .split(';')
    .map((s) => s.replace(/--.*$/gm, '').trim())
    .filter(
      (s) =>
        s.length > 0 &&
        s.toUpperCase() !== 'BEGIN' &&
        s.toUpperCase() !== 'COMMIT',
    );

  console.log(`Applying ${statements.length} seed statements...`);
  for (const statement of statements) {
    await client.$executeRawUnsafe(statement);
  }
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await client.$disconnect();
  });
