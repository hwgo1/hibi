import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

export const HIBI_HOME = join(homedir(), ".hibi");

export const ProviderIdSchema = z.enum(["openai", "anthropic"]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const CredentialsSchema = z.object({
  provider: ProviderIdSchema,
  apiKey: z.string().min(1),
  model: z.string().min(1),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

const CREDENTIALS_PATH = join(HIBI_HOME, "credentials.json");

/**
 * Reads stored credentials. Environment variables take precedence so a
 * throwaway key or a scripted run does not require touching the stored file
 */
export async function loadCredentials(): Promise<Credentials | null> {
  const fromEnv = credentialsFromEnv();
  if (fromEnv !== null) return fromEnv;

  try {
    const raw = await readFile(CREDENTIALS_PATH, "utf8");
    return CredentialsSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Writes credentials with owner-only permissions, through a temporary file so
 * an interrupted write cannot leave an unreadable or half-written key
 */
export async function saveCredentials(credentials: Credentials): Promise<void> {
  await mkdir(HIBI_HOME, { recursive: true });
  const tmp = `${CREDENTIALS_PATH}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(credentials, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tmp, CREDENTIALS_PATH);
  await chmod(CREDENTIALS_PATH, 0o600);
}

export function credentialsPath(): string {
  return CREDENTIALS_PATH;
}

function credentialsFromEnv(): Credentials | null {
  const model = process.env["HIBI_MODEL"];

  const openai = process.env["OPENAI_API_KEY"];
  if (openai !== undefined) {
    return { provider: "openai", apiKey: openai, model: model ?? "gpt-4.1" };
  }

  const anthropic = process.env["ANTHROPIC_API_KEY"];
  if (anthropic !== undefined) {
    return {
      provider: "anthropic",
      apiKey: anthropic,
      model: model ?? "claude-sonnet-4-6",
    };
  }

  return null;
}
