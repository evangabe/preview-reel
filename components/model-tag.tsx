import { OpenAIIcon } from "@/components/icons/openai";
import { modelDisplayName, modelProvider } from "@/lib/ai/model";
import type { ModelInfo } from "@/lib/storage/metadata";

/**
 * Provider mark + human-readable model name + reasoning-effort sub-tag.
 * Styled like the gallery's PR tag: muted pill, no border.
 */
export function ModelTag({ model }: { model: ModelInfo | null }) {
  if (model === null) {
    return <span className="text-sm text-muted-foreground">not recorded</span>;
  }

  const name = modelDisplayName(model.id);
  return (
    <span
      aria-label={`${name}, ${model.reasoningEffort} reasoning`}
      title={model.id}
      className="inline-flex items-center gap-1.5 rounded-md bg-muted/80 px-2 py-1 text-sm text-foreground"
    >
      {modelProvider(model.id) === "openai" ? (
        <OpenAIIcon className="size-3.5 shrink-0" />
      ) : null}
      <span>{name}</span>
      <span className="rounded bg-background/60 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
        {model.reasoningEffort}
      </span>
    </span>
  );
}
