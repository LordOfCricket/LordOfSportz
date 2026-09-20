/**
 * SEED / DEMO DATA — for local development only. Every record created here
 * is clearly fictional and must never be mistaken for production data. Do
 * not run this against a staging or production database.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding demo data...");

  const shotokan = await prisma.karateStyle.upsert({
    where: { name: "Shotokan" },
    update: {},
    create: { name: "Shotokan", description: "[SEED] Demo Karate style." },
  });

  const beltSystem = await prisma.beltSystem.upsert({
    where: { karateStyleId_name: { karateStyleId: shotokan.id, name: "Standard Kyu/Dan" } },
    update: {},
    create: {
      karateStyleId: shotokan.id,
      name: "Standard Kyu/Dan",
      description: "[SEED] Demo belt system.",
    },
  });

  const beltGrades = [
    { name: "9th Kyu", type: "KYU" as const, rankOrder: 1, colorName: "White" },
    { name: "8th Kyu", type: "KYU" as const, rankOrder: 2, colorName: "Yellow" },
    { name: "1st Dan", type: "DAN" as const, rankOrder: 10, colorName: "Black" },
  ];
  for (const grade of beltGrades) {
    await prisma.beltGrade.upsert({
      where: { beltSystemId_rankOrder: { beltSystemId: beltSystem.id, rankOrder: grade.rankOrder } },
      update: {},
      create: { beltSystemId: beltSystem.id, ...grade },
    });
  }

  const season2026 = await prisma.season.upsert({
    where: { name: "2026" },
    update: {},
    create: {
      name: "2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      isActive: true,
    },
  });

  const academyOwnerUser = await prisma.user.upsert({
    where: { email: "seed-academy-owner@example.com" },
    update: {},
    create: {
      email: "seed-academy-owner@example.com",
      fullName: "[SEED] Academy Owner",
      status: "ACTIVE",
      roles: { create: [{ role: "ACADEMY" }] },
    },
  });

  const academy = await prisma.academy.upsert({
    where: { slug: "seed-demo-dojo" },
    update: {},
    create: {
      name: "[SEED] Demo Dojo",
      slug: "seed-demo-dojo",
      description: "Fictional academy created by the database seed script.",
      status: "ACTIVE",
      createdById: academyOwnerUser.id,
      administrators: { create: [{ userId: academyOwnerUser.id, role: "OWNER" }] },
    },
  });

  const organizer = await prisma.tournamentOrganizer.upsert({
    where: { academyId: academy.id },
    update: {},
    create: { organizerType: "ACADEMY", academyId: academy.id },
  });

  await prisma.tournament.upsert({
    where: { slug: "seed-spring-open-2026" },
    update: {},
    create: {
      organizerId: organizer.id,
      name: "[SEED] Spring Regional Open",
      slug: "seed-spring-open-2026",
      description: "Fictional tournament created by the database seed script.",
      status: "DRAFT",
      createdByUserId: academyOwnerUser.id,
    },
  });

  const coachUser = await prisma.user.upsert({
    where: { email: "seed-coach@example.com" },
    update: {},
    create: {
      email: "seed-coach@example.com",
      fullName: "[SEED] Demo Coach",
      status: "ACTIVE",
      roles: { create: [{ role: "COACH" }] },
      coachProfile: { create: { bio: "[SEED] Demo coach profile." } },
    },
    include: { coachProfile: true },
  });

  const playerUser = await prisma.user.upsert({
    where: { email: "seed-player@example.com" },
    update: {},
    create: {
      email: "seed-player@example.com",
      fullName: "[SEED] Demo Player",
      status: "ACTIVE",
      roles: { create: [{ role: "PLAYER" }] },
      playerProfile: {
        create: { dateOfBirth: new Date("2005-06-15"), gender: "MALE", bio: "[SEED] Demo player." },
      },
    },
    include: { playerProfile: true },
  });

  await prisma.user.upsert({
    where: { email: "seed-scorer@example.com" },
    update: {},
    create: {
      email: "seed-scorer@example.com",
      fullName: "[SEED] Demo Scorer",
      status: "ACTIVE",
      roles: { create: [{ role: "SCORER" }] },
      scorerProfile: { create: { certificationLevel: "[SEED] Level 1" } },
    },
  });

  console.log("Seed complete:", {
    academy: academy.slug,
    season: season2026.name,
    coachUser: coachUser.email,
    playerUser: playerUser.email,
  });
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
