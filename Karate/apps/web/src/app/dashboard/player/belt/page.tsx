import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getCurrentUserOrRedirect } from "@/lib/server/current-user";
import { getMyBeltHistory } from "@/lib/server/domain";

export default async function PlayerBeltPage() {
  await getCurrentUserOrRedirect("/dashboard/player/belt");
  const data = await getMyBeltHistory();
  return <Card><CardHeader><CardTitle>Belt history and certificates</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">{data?.history.length ? data.history.map((entry) => <div key={entry.id} className="flex items-center justify-between border-b border-border pb-3 text-sm"><span>{entry.beltGrade.name}</span><Badge tone={entry.verificationStatus === "VERIFIED" ? "success" : "neutral"}>{entry.verificationStatus}</Badge>{entry.certificate && <a className="text-accent underline" href={`/verify/certificate/${entry.certificate.verificationCode}`}>Verify</a>}</div>) : <p className="text-sm text-text-secondary">No belt history yet.</p>}</CardContent></Card>;
}
