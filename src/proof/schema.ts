import { Ajv2020 } from "ajv/dist/2020.js";
import { fullFormats } from "ajv-formats/dist/formats.js";
import schema from "../../schemas/proof-bundle.schema.json" with { type: "json" };
import type { ProofBundle } from "../types.js";

// Validate the published format itself. Never coerce, remove fields, or apply
// defaults: changing imported bytes would change what the producer signed.
const validator = new Ajv2020({ allErrors: false, strict: true });
validator.addFormat("date-time", fullFormats["date-time"]);
const validate = validator.compile<ProofBundle>(schema);

export function proofStructureErrors(value: unknown): string[] {
  if (validate(value)) return [];
  return (validate.errors ?? []).map((error) => {
    const path = error.instancePath || "/";
    const field = error.params["missingProperty"] ?? error.params["additionalProperty"];
    return `Invalid proof structure at ${path}${field ? ` (${String(field)})` : ""}: ${error.message ?? error.keyword}.`;
  });
}

export function parseProofBundle(value: unknown): ProofBundle {
  const errors = proofStructureErrors(value);
  if (errors.length) throw new Error(errors.join(" "));
  return value as ProofBundle;
}
