export class GitError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly stderr: string;

  constructor(
    message: string,
    args: readonly string[],
    exitCode: number | null,
    stderr: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "GitError";
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}
