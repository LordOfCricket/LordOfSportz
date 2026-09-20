import { notFound } from "next/navigation";
export default async function CertificateVerificationPage({ params }: { params: { code: string } }) {
  const response = await fetch(`${process.env["API_BASE_URL"] ?? "http://localhost:4000"}/api/v1/grading/certificates/verify/${params.code}`, { cache: "no-store" });
  if (!response.ok) notFound();
  const body = await response.json(); const certificate = body.data;
  return <main className="mx-auto max-w-xl p-6"><h1 className="text-xl font-semibold">Certificate verification</h1><p className="mt-4">{certificate.playerDisplayName ?? "Participant"}</p><p className="text-sm text-text-secondary">{certificate.type} · {certificate.serialNumber}</p><p className="mt-3 text-sm">Status: {certificate.verificationStatus}</p></main>;
}