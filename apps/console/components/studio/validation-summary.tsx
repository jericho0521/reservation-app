import Link from "next/link";
import type { ExperienceValidationResponse } from "@reservation-platform/sdk";
import { getStudioSectionHref, sectionForValidationPath } from "../../lib/studio-sections";

export function ValidationSummary({ validation }: { validation: ExperienceValidationResponse }) {
  return <section className={`validation-summary ${validation.valid ? "valid" : "invalid"}`}>
    <div>
      <span className="eyebrow">Publication check</span>
      <h2>{validation.valid ? "Ready to publish" : `${validation.issues.length} issue${validation.issues.length === 1 ? "" : "s"} need attention`}</h2>
    </div>
    {validation.valid ? <p>Every required Studio section has passed validation.</p> : <ul>
      {validation.issues.map((issue, index) => {
        const section = sectionForValidationPath(issue.path);
        return <li key={`${issue.path}-${index}`}>
          <div><code>{issue.path}</code><span>{issue.message}</span></div>
          <Link href={getStudioSectionHref(section)}>Fix in {section}</Link>
        </li>;
      })}
    </ul>}
  </section>;
}
