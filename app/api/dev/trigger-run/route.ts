import { NextResponse } from "next/server";
import { start } from "workflow/api";

import {
  recordDemo,
  type RecordDemoInput,
} from "@/workflows/record-demo";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const input = (await request.json()) as RecordDemoInput;
  const run = await start(recordDemo, [input]);
  return NextResponse.json({ runId: run.runId });
}
