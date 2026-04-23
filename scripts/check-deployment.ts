import "dotenv/config";
import { getDeploymentDiagnostics } from "../server/_core/deployment.js";

const runtimeArg = process.argv[2];
const runtime =
  runtimeArg === "development" || runtimeArg === "node" || runtimeArg === "vercel"
    ? runtimeArg
    : process.env.VERCEL
      ? "vercel"
      : process.env.NODE_ENV === "development"
        ? "development"
        : "node";

const diagnostics = getDeploymentDiagnostics(runtime);

console.log(JSON.stringify(diagnostics, null, 2));

if (!diagnostics.ready) {
  process.exitCode = 1;
}
