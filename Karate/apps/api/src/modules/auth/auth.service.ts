import bcrypt from "bcryptjs";
import { prisma } from "@karate/database";
import type { LoginRequest, RegisterRequest } from "@karate/validation";
import type { UserRole } from "@karate/types";
import { AuthenticationError, ConflictError, NotFoundError } from "@karate/shared";
import { issueAccessToken } from "./access-token.util";
import { createRefreshSession } from "./refresh.service";

const BCRYPT_SALT_ROUNDS = 12;

interface AuthResult {
  userId: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  accessToken: string;
  refreshToken: string;
}

export interface CurrentUser {
  userId: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  status: string;
}

export async function register(input: RegisterRequest): Promise<AuthResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      roles: { create: [{ role: input.role }] },
    },
    include: { roles: true },
  });

  const roles = user.roles.map((r) => r.role) as UserRole[];
  const accessToken = issueAccessToken(user.id, roles);
  const refreshToken = await createRefreshSession(prisma, user.id);

  return { userId: user.id, email: user.email, fullName: user.fullName, roles, accessToken, refreshToken };
}

export async function getCurrentUser(userId: string): Promise<CurrentUser> {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { roles: true } });
  if (!user) {
    throw new NotFoundError("User", userId);
  }

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: user.roles.map((r) => r.role) as UserRole[],
    status: user.status,
  };
}

export async function login(input: LoginRequest): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email }, include: { roles: true } });

  // Constant-shape failure path: don't reveal whether the email exists.
  if (!user || !user.passwordHash) {
    throw new AuthenticationError("Invalid email or password.");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordMatches) {
    throw new AuthenticationError("Invalid email or password.");
  }

  if (user.status !== "ACTIVE") {
    throw new AuthenticationError("This account is not active.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const roles = user.roles.map((r) => r.role) as UserRole[];
  const accessToken = issueAccessToken(user.id, roles);
  const refreshToken = await createRefreshSession(prisma, user.id);

  return { userId: user.id, email: user.email, fullName: user.fullName, roles, accessToken, refreshToken };
}
