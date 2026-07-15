import { notFound } from "next/navigation";
import { getStudioSection } from "../../../lib/studio-sections";

export default async function StudioSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section: sectionId } = await params;
  const section = getStudioSection(sectionId);
  if (!section) notFound();

  return (
    <div className="page-stack">
      <header className="page-header">
        <span className="eyebrow">Experience Studio</span>
        <h1>{section.label}</h1>
        <p>{section.description}</p>
      </header>
      <section className="panel section-foundation">
        <span className="status-pill">Guided setup</span>
        <h2>{section.shortLabel} workspace</h2>
        <p>This section is connected to the saved experience draft and ready for its focused editor.</p>
        <a className="secondary-action" href="/admin/studio">Review preset catalogue</a>
      </section>
    </div>
  );
}
