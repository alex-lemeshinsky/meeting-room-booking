import { Inject, Injectable } from "@nestjs/common";
import { AppError } from "../common/errors/app-error.js";
import { DatabaseService } from "../database/database.service.js";
import { Prisma, type User } from "../generated/prisma/client.js";

export interface CreateUserInput {
  name: string;
  emailNormalized: string;
  passwordHash: string;
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  findByNormalizedEmail(emailNormalized: string): Promise<User | null> {
    return this.database.user.findUnique({ where: { emailNormalized } });
  }

  async createUser(input: CreateUserInput): Promise<User> {
    try {
      return await this.database.user.create({ data: input });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        includesEmailNormalized(error.meta)
      ) {
        throw new AppError(
          409,
          "EMAIL_ALREADY_REGISTERED",
          "Email already registered",
          { email: ["Обліковий запис із цим email уже існує"] }
        );
      }
      throw error;
    }
  }

  toPublicUser(user: User): PublicUser {
    return { id: user.id, name: user.name, email: user.emailNormalized };
  }
}

function includesEmailNormalized(meta: unknown): boolean {
  const target = isRecord(meta) ? meta.target : undefined;
  const fields = isRecord(meta)
    ? isRecord(meta.driverAdapterError) &&
      isRecord(meta.driverAdapterError.cause)
      ? isRecord(meta.driverAdapterError.cause.constraint)
        ? meta.driverAdapterError.cause.constraint.fields
        : undefined
      : undefined
    : undefined;

  return [target, fields].some(
    (value) =>
      value === "email_normalized" ||
      value === "emailNormalized" ||
      (Array.isArray(value) &&
        value.some(
          (column) =>
            column === "email_normalized" || column === "emailNormalized"
        ))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
