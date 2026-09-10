import { NextResponse } from "next/server";

import { loadRunView } from "@/lib/storage/run-view";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const view = await loadRunView(runId);
  const headers = { "Cache-Control": "no-store" };

  if (!view) {
    return NextResponse.json(
      { error: "run not found" },
      { status: 404, headers },
    );
  }
  return NextResponse.json(view, { headers });
}
