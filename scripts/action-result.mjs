import { appendFile, readFile } from "node:fs/promises";

// Input comes from the CLI's JSON result, never from interpolation into shell code.
const result = JSON.parse(process.env.PATCHPROOF_RESULT || "null");
const verdicts = ["verified", "rejected", "incomplete", "error"];
if (!result || !verdicts.includes(result.verdict?.status) || typeof result.proof !== "string") {
  throw new Error("PatchProof did not return a verification result; no proof summary was published.");
}
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `verdict=${result.verdict.status}\n`, "utf8");
}
if (process.env.GITHUB_STEP_SUMMARY && result.summary) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, await readFile(result.summary, "utf8"), "utf8");
}
