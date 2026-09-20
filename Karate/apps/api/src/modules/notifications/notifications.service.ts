import { prisma } from "@karate/database";
import { NotFoundError } from "@karate/shared";

export async function listForUser(userId: string) {
  return prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, type: true, title: true, body: true, data: true, isRead: true, createdAt: true, readAt: true } });
}

export async function markRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, userId }, select: { id: true } });
  if (!notification) throw new NotFoundError("Notification", notificationId);
  return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true, readAt: new Date() }, select: { id: true, isRead: true, readAt: true } });
}

export async function createNotification(input: { userId: string; type: string; title: string; body?: string; data?: Record<string, string> }) {
  const resultId = input.data?.["resultId"];
  const existing = resultId ? await prisma.notification.findFirst({ where: { userId: input.userId, type: input.type, data: { path: ["resultId"], equals: resultId } }, select: { id: true } }) : null;
  if (existing) return existing;
  return prisma.notification.create({ data: { userId: input.userId, type: input.type, title: input.title, body: input.body, data: input.data } });
}
