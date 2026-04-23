const baseUrl = process.argv[2] || process.env.DEPLOY_URL;

if (!baseUrl) {
  console.error("Usage: pnpm smoke:deploy -- <https://your-domain>");
  process.exit(1);
}

const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
const checks = [
  { name: "homepage", url: `${normalizedBaseUrl}/`, expectedStatus: 200 },
  { name: "pricing", url: `${normalizedBaseUrl}/pricing`, expectedStatus: 200 },
  { name: "health", url: `${normalizedBaseUrl}/api/health`, expectedStatus: 200 },
];

async function main() {
  let hasFailure = false;

  for (const check of checks) {
    try {
      const response = await fetch(check.url, {
        redirect: "follow",
        headers: { "user-agent": "learnflow-smoke-check" },
      });
      console.log(
        JSON.stringify({
          name: check.name,
          url: check.url,
          status: response.status,
          ok: response.status === check.expectedStatus,
        })
      );
      if (response.status !== check.expectedStatus) {
        hasFailure = true;
      }
    } catch (error) {
      hasFailure = true;
      console.log(
        JSON.stringify({
          name: check.name,
          url: check.url,
          ok: false,
          error: String(error),
        })
      );
    }
  }

  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
