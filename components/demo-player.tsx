import { Card } from "@/components/ui/card";
import type { DemoMetadata } from "@/lib/storage/metadata";

export function DemoPlayer({ demo }: { demo: DemoMetadata }) {
  return (
    <Card className="p-1.5">
      <video
        controls
        preload="metadata"
        poster={demo.artifacts.posterUrl}
        src={demo.artifacts.videoUrl}
        aria-label={`${demo.demoTitle} recording`}
        className="aspect-video w-full rounded-lg bg-black object-contain"
      >
        This browser cannot play the recorded MP4.
      </video>
    </Card>
  );
}
