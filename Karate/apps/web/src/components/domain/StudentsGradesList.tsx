import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import type { StudentGrade } from "@/lib/server/domain";

export function StudentsGradesList({ students }: { students: StudentGrade[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Students&apos; current grades</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {students.length === 0 ? (
          <EmptyState
            title="No students yet"
            description="Players at academies you're actively affiliated with will appear here."
          />
        ) : (
          students.map((s) => (
            <div key={s.playerId} className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-primary">{s.displayName}</span>
              {s.currentGrade ? (
                <Badge tone={s.currentGrade.verificationStatus === "VERIFIED" ? "success" : "neutral"}>
                  {s.currentGrade.name}
                </Badge>
              ) : (
                <Badge tone="neutral">No grade</Badge>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
