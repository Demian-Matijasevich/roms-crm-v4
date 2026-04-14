import { execSync } from "child_process";

function sh(cmd: string): string {
  return execSync(cmd, { encoding: "utf8" });
}

async function main() {
  console.log("Waiting 30s for Vercel deploy...");
  await new Promise((r) => setTimeout(r, 30000));

  for (let i = 0; i < 10; i++) {
    const out = sh("vercel ls roms-crm-v4 2>&1");
    const line = out.split("\n").find((l) => l.includes("roms-crm-v4-") && l.includes("Ready"));
    const match = line?.match(/roms-crm-v4-[a-z0-9]+-demian-matijasevichs-projects\.vercel\.app/);
    if (match) {
      const url = match[0];
      console.log(`Latest Ready: ${url}`);
      const setOut = sh(`vercel alias set ${url} crm.backstagge.com 2>&1`);
      console.log(setOut);
      const check = sh(`curl -sSL -o /dev/null -w "%{http_code}" "https://crm.backstagge.com"`);
      console.log(`crm.backstagge.com → HTTP ${check}`);
      return;
    }
    console.log(`Attempt ${i + 1}: no ready deploy yet, waiting 15s...`);
    await new Promise((r) => setTimeout(r, 15000));
  }
  console.error("Timed out waiting for deploy");
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
