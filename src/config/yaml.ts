import { parseDocument } from "yaml";
import { ConfigValidationError, type ConfigIssue } from "./errors.js";

export function parseYamlDocument(
  contents: string,
  kind: "policy" | "contract",
  source: string,
): unknown {
  const document = parseDocument(contents, {
    prettyErrors: true,
    strict: true,
    uniqueKeys: true,
  });

  if (document.errors.length > 0) {
    const issues: ConfigIssue[] = document.errors.map((error) => ({
      path: "$",
      message: error.message,
      code: error.code,
    }));
    throw new ConfigValidationError(kind, source, issues);
  }

  try {
    return document.toJS({ maxAliasCount: 100 });
  } catch (error) {
    throw new ConfigValidationError(kind, source, [
      {
        path: "$",
        message: error instanceof Error ? error.message : "Unable to decode YAML document",
        code: "invalid_yaml",
      },
    ]);
  }
}
