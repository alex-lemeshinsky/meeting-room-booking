import { verifyRepository } from "./repository-policy.mjs";

try {
  const result = await verifyRepository(process.cwd());
  console.log(`workspace verified: ${result.packageCount} packages`);
} catch (error) {
  if (error?.violations) {
    for (const violation of error.violations) console.error(violation);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
