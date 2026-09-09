import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./.runner/runner.mjs"],
  },
};

export default withWorkflow(nextConfig);
