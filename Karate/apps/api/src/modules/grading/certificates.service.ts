import { prisma } from "@karate/database";
import { NotFoundError } from "@karate/shared";

/** Public, unauthenticated lookup — the entire point is that anyone holding the code can confirm authenticity. */
export async function verifyCertificateByCode(verificationCode: string) {
  const certificate = await prisma.certificate.findUnique({
    where: { verificationCode },
    select: {
      id: true,
      type: true,
      serialNumber: true,
      verificationStatus: true,
      issuedAt: true,
      playerId: true,
    },
  });
  if (!certificate) {
    throw new NotFoundError("Certificate");
  }

  // `playerId` is a raw reference (Certificate predates a formal PlayerProfile relation), resolved here.
  const player = certificate.playerId
    ? await prisma.playerProfile.findUnique({
        where: { id: certificate.playerId },
        select: { displayName: true },
      })
    : null;

  return {
    id: certificate.id,
    type: certificate.type,
    serialNumber: certificate.serialNumber,
    verificationStatus: certificate.verificationStatus,
    issuedAt: certificate.issuedAt,
    playerDisplayName: player?.displayName ?? null,
  };
}
