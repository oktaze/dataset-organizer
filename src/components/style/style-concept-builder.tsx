import { AlwaysTagsSection } from "@/components/style/always-tags-section";
import { ConstantTagsSection } from "@/components/costumes/constant-tags-section";
import type { Project } from "@/lib/types";

interface StyleConceptBuilderProps {
  project: Project;
}

/** Simplified setup for Style / Concept LoRAs — no costumes. Define the
 *  tags that should always appear, and the ones to exclude (baked into
 *  the trigger). */
export function StyleConceptBuilder({ project }: StyleConceptBuilderProps) {
  const kind = project.type === "style" ? "Style" : "Concept";

  return (
    <section className="flex h-full flex-col overflow-hidden bg-background">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium text-foreground">{kind} setup</h2>
        <p className="text-xs text-muted-foreground">
          No costumes for {kind.toLowerCase()} LoRAs — captions are{" "}
          <code>trigger · always-tags · detected tags</code> (minus excluded).
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        <AlwaysTagsSection projectId={project.id} />
        <ConstantTagsSection projectId={project.id} />
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          Tip: put the stable descriptors of your {kind.toLowerCase()} (medium,
          rendering, source) in <strong>always-included</strong>. Put anything
          the LoRA should absorb into the trigger itself (so it isn't
          captioned) in <strong>excluded</strong>. Re-run{" "}
          <strong>Reprocess</strong> in the gallery after changing these.
        </p>
      </div>
    </section>
  );
}
