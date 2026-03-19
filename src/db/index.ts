import { PrismaClient } from "@prisma/client";

// Defined locally — mirrors schema enum, avoids generated client dependency
export enum TransferStatus {
  PENDING   = "PENDING",
  CONFIRMED = "CONFIRMED",
  CLAIMED   = "CLAIMED",
  CANCELLED = "CANCELLED",
}

export const prisma = new PrismaClient();

// ── Users ──────────────────────────────────────────────────────────────────

export async function findUser(telegramId: string) {
  return prisma.user.findUnique({ where: { telegramId } });
}

export async function findUserByUsername(username: string) {
  return prisma.user.findFirst({ where: { username } });
}

export async function createUser(
  telegramId: string,
  address: string,
  encryptedKey: string,
  username?: string
) {
  return prisma.user.create({
    data: { telegramId, address: address.toLowerCase(), encryptedKey, username },
  });
}

export async function updateUsername(telegramId: string, username: string) {
  return prisma.user.update({ where: { telegramId }, data: { username } });
}

// ── Transfers ─────────────────────────────────────────────────────────────

export async function createTransfer(senderId: number, recipientId: number, amount: string) {
  return prisma.transfer.create({
    data: { senderId, recipientId, amount, status: TransferStatus.PENDING },
  });
}

export async function confirmTransfer(id: number, txHash: string, onChainId: number) {
  return prisma.transfer.update({
    where: { id },
    data:  { txHash, onChainId, status: TransferStatus.CONFIRMED },
  });
}

export async function updateTransferStatus(id: number, status: TransferStatus) {
  return prisma.transfer.update({ where: { id }, data: { status } });
}

export async function getPendingForRecipient(recipientId: number) {
  return prisma.transfer.findMany({
    where:   { recipientId, status: TransferStatus.CONFIRMED },
    include: { sender: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getHistory(userId: number) {
  return prisma.transfer.findMany({
    where:   { OR: [{ senderId: userId }, { recipientId: userId }] },
    include: { sender: true, recipient: true },
    orderBy: { createdAt: "desc" },
    take:    10,
  });
}

export async function getTransferById(id: number) {
  return prisma.transfer.findUnique({
    where:   { id },
    include: { sender: true, recipient: true },
  });
}