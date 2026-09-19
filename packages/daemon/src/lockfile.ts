import { mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";

/** Ensures one daemon per repository. `wx` fails when the file exists, making creation an atomic test-and-set */
export async function acquireLock(path: string): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });

  try {
    const handle = await open(path, "wx");
    await handle.writeFile(String(process.pid));
    await handle.close();
    return true;
  } catch {
    const owner = await readOwner(path);
    if (owner !== null && isAlive(owner)) return false;
    await rm(path, { force: true });
    return acquireLock(path);
  }
}

export async function releaseLock(path: string): Promise<void> {
  await rm(path, { force: true });
}

async function readOwner(path: string): Promise<number | null> {
  try {
    const pid = Number.parseInt(await readFile(path, "utf8"), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** Signal 0 performs the existence and permission check without delivering */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
