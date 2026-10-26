import { notFound } from "next/navigation";
import { DEMO_STUDIES, getDemoStudyById } from "@/lib/demo-data";
import { StudyViewerClient } from "@/components/StudyViewerClient";

export function generateStaticParams() {
  return DEMO_STUDIES.map((entry) => ({
    id: entry.analysis.study.study_id,
  }));
}

export default async function StudyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const studyEntry = getDemoStudyById(id);

  if (!studyEntry) {
    notFound();
  }

  return <StudyViewerClient studyEntry={studyEntry} />;
}
