import { prisma } from "@karate/database";
import type { CreateBeltGradeRequest, CreateBeltSystemRequest } from "@karate/validation";
import { ConflictError, NotFoundError } from "@karate/shared";

const GRADE_SELECT = {
  id: true,
  name: true,
  type: true,
  rankOrder: true,
  colorName: true,
  colorHex: true,
} as const;

export async function listBeltSystems(karateStyleId?: string) {
  return prisma.beltSystem.findMany({
    where: { isActive: true, ...(karateStyleId ? { karateStyleId } : {}) },
    select: { id: true, karateStyleId: true, name: true, description: true },
    orderBy: { name: "asc" },
  });
}

export async function createBeltSystem(input: CreateBeltSystemRequest) {
  const style = await prisma.karateStyle.findUnique({ where: { id: input.karateStyleId } });
  if (!style) {
    throw new NotFoundError("Karate style", input.karateStyleId);
  }

  try {
    return await prisma.beltSystem.create({
      data: { karateStyleId: input.karateStyleId, name: input.name, description: input.description },
      select: { id: true, karateStyleId: true, name: true, description: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("A belt system with this name already exists for this style.");
    }
    throw error;
  }
}

export async function listBeltGrades(beltSystemId: string) {
  const system = await prisma.beltSystem.findUnique({ where: { id: beltSystemId } });
  if (!system) {
    throw new NotFoundError("Belt system", beltSystemId);
  }
  return prisma.beltGrade.findMany({
    where: { beltSystemId },
    select: GRADE_SELECT,
    orderBy: { rankOrder: "asc" },
  });
}

export async function createBeltGrade(beltSystemId: string, input: CreateBeltGradeRequest) {
  const system = await prisma.beltSystem.findUnique({ where: { id: beltSystemId } });
  if (!system) {
    throw new NotFoundError("Belt system", beltSystemId);
  }

  try {
    return await prisma.beltGrade.create({
      data: { beltSystemId, ...input },
      select: GRADE_SELECT,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ConflictError("A grade with this rank order already exists in this belt system.");
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}
