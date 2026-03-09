import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'Code Heaven Admin';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in your .env file');
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });

  if (existing) {
    console.log(`[seed] Admin user already exists: ${email}`);
    console.log('[seed] To reset the password, delete the row and re-run.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.create({
    data: {
      id: uuidv4(),
      email,
      passwordHash,
      name,
    },
  });

  console.log(`[seed] Created admin user: ${admin.email} (id: ${admin.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('[seed] Error:', err);
    void prisma.$disconnect();
    process.exit(1);
  });
