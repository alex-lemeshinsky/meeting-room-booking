import { PrismaPg } from "@prisma/adapter-pg";
import { STAGE7_EMAIL_VERIFICATION_FIXTURES } from "../../../e2e/support/email-verification-fixtures.js";
import { hashVerificationToken } from "../src/auth/email-verification/verification-token.js";
import { Argon2PasswordHasher } from "../src/auth/password/argon2-password-hasher.js";
import { PrismaClient } from "../src/generated/prisma/client.js";

const fixtureExpiry = new Date("2030-01-10T10:00:00.000Z");

export async function seedE2eEmailVerificationFixtures(
  databaseUrl: string
): Promise<void> {
  const database = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl })
  });
  const passwords = new Argon2PasswordHasher();

  try {
    for (const fixture of STAGE7_EMAIL_VERIFICATION_FIXTURES) {
      const passwordHash = await passwords.hash(fixture.password);

      await database.$transaction(async (transaction) => {
        await transaction.user.upsert({
          where: { id: fixture.id },
          update: {
            name: fixture.name,
            emailNormalized: fixture.email,
            passwordHash,
            emailVerifiedAt: null
          },
          create: {
            id: fixture.id,
            name: fixture.name,
            emailNormalized: fixture.email,
            passwordHash,
            emailVerifiedAt: null
          }
        });
        await transaction.emailVerificationToken.deleteMany({
          where: { userId: fixture.id }
        });
        await transaction.emailVerificationToken.create({
          data: {
            userId: fixture.id,
            tokenHash: hashVerificationToken(fixture.token),
            expiresAt: fixtureExpiry,
            usedAt: null
          }
        });
      });
    }
  } finally {
    await database.$disconnect();
  }
}
