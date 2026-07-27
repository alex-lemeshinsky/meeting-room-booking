import { PrismaPg } from "@prisma/adapter-pg";
import { Argon2PasswordHasher } from "../apps/api/src/auth/password/argon2-password-hasher.js";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";

const users = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Олена",
    emailNormalized: "olena@example.com",
    password: "Rooms123!"
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Алекс",
    emailNormalized: "alex@example.com",
    password: "Meeting123!"
  }
] as const;

const rooms = [
  ["10000000-0000-4000-8000-000000000001", "Арсенал", 1, 4],
  ["10000000-0000-4000-8000-000000000002", "Дніпро", 1, 6],
  ["10000000-0000-4000-8000-000000000003", "Либідь", 2, 8],
  ["10000000-0000-4000-8000-000000000004", "Обрій", 2, 10],
  ["10000000-0000-4000-8000-000000000005", "Поділ", 3, 12],
  ["10000000-0000-4000-8000-000000000006", "Софія", 3, 16]
] as const;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for seeding");

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl })
});
const passwords = new Argon2PasswordHasher();

async function seed(): Promise<void> {
  for (const user of users) {
    const existing = await database.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true }
    });
    await database.user.upsert({
      where: { id: user.id },
      update: { name: user.name, emailNormalized: user.emailNormalized },
      create: {
        id: user.id,
        name: user.name,
        emailNormalized: user.emailNormalized,
        passwordHash:
          existing?.passwordHash ?? (await passwords.hash(user.password))
      }
    });
  }

  for (const [id, name, floor, capacity] of rooms) {
    await database.room.upsert({
      where: { id },
      update: { name, floor, capacity },
      create: { id, name, floor, capacity }
    });
  }
}

try {
  await seed();
} finally {
  await database.$disconnect();
}
