"use client";

import { useEffect } from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function RunError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-5 py-20 sm:px-8">
      <Alert variant="destructive">
        <AlertTitle>Could not load this run</AlertTitle>
        <AlertDescription>
          Preview Reel could not read the run state from Workflow and Blob
          storage.
          {error.digest ? ` Error reference: ${error.digest}.` : null}
        </AlertDescription>
      </Alert>
      <Button onClick={retry} className="self-start">
        Try again
      </Button>
    </main>
  );
}
