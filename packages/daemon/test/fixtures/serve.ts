import { FakeProvider } from "@hibi/core";

import { Daemon, serve } from "../../src";

/** Runs a daemon on the home given as the first argument, so tests can stop it with a real `shutdown` */
const home = process.argv[2]!;

try {
  await serve(new Daemon({ provider: new FakeProvider([]), home }), home);
  process.stdout.write("listening\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}
