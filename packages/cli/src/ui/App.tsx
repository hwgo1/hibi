import { Static, useApp } from "ink";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

import type { ServerEvent } from "@hibi/daemon";

import { DaemonLostError, type DaemonClient } from "../client";
import type { HelpContent } from "../help";
import type { Catalog } from "../i18n";
import {
  addUsage,
  emptySpend,
  formatSpend,
  type SessionSpend,
} from "../spend";
import { Prompt } from "./Prompt";
import { RowView } from "./RowView";
import { Thinking } from "./Thinking";
import type { Row, RowInput } from "./types";
import { Welcome, type WelcomeContent } from "./Welcome";

/** How often streamed text is repainted. Faster only burns CPU on reconciliation */
const FLUSH_MS = 60;

export interface CommandResult {
  output?: string;
  /** A short confirmation from the daemon, shown quieter than output */
  notice?: string;
  error?: string;
  help?: "short" | "full";
  exit?: boolean;
}

export interface AppProps {
  client: DaemonClient;
  welcome: WelcomeContent;
  strings: Catalog;
  help: HelpContent;
  onCommand: (input: string) => Promise<CommandResult>;
}

export function App({
  client,
  welcome,
  strings,
  help,
  onCommand,
}: AppProps): ReactElement {
  const { exit } = useApp();
  const nextId = useRef(1);

  const [rows, setRows] = useState<Row[]>(() => [{ id: 0, kind: "welcome" }]);
  const [liveText, setLiveText] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  const stream = useRef("");
  const turnErrors = useRef<string[]>([]);
  const hintGiven = useRef(false);
  const turnStep = useRef<1 | 2 | 3 | undefined>(undefined);
  const spend = useRef<SessionSpend>(emptySpend());
  const busyRef = useRef(false);

  const append = useCallback((...input: RowInput[]) => {
    setRows((current) => [
      ...current,
      ...input.map((row) => ({ ...row, id: nextId.current++ }) as Row),
    ]);
  }, []);

  const onTurnEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case "text":
        stream.current += event.text;
        return;

      case "tool":
        if (event.name === "give_hint") hintGiven.current = true;
        return;

      case "step":
        if (hintGiven.current) turnStep.current = event.step;
        return;

      case "usage":
        spend.current = addUsage(spend.current, event);
        return;

      case "error":
        turnErrors.current.push(event.message);
        return;

      default:
        return;
    }
  }, []);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setLiveText(stream.current), FLUSH_MS);
    return () => clearInterval(timer);
  }, [busy]);

  /** Moves the finished answer into the static transcript and resets turn state */
  const finishTurn = useCallback(() => {
    const finished: RowInput[] = [];

    if (stream.current.length > 0) {
      finished.push(
        turnStep.current === undefined
          ? { kind: "tutor", text: stream.current }
          : { kind: "tutor", text: stream.current, step: turnStep.current },
      );
    }
    for (const message of turnErrors.current) {
      finished.push({ kind: "error", text: message });
    }

    stream.current = "";
    turnErrors.current = [];
    hintGiven.current = false;
    turnStep.current = undefined;
    setLiveText("");

    if (finished.length > 0) append(...finished);
  }, [append]);

  const submit = useCallback(
    async (value: string) => {
      const text = value.trim();
      if (text.length === 0 || busyRef.current) return;

      setHistory((current) => [...current, text]);
      append({ kind: "user", text });

      if (text === "/exit") {
        exit();
        return;
      }

      if (text === "/cost") {
        append({ kind: "output", text: formatSpend(spend.current) });
        return;
      }

      if (text.startsWith("/")) {
        let result: CommandResult;
        try {
          result = await onCommand(text);
        } catch (error) {
          result = { error: failureText(error, strings) };
        }
        if (result.help !== undefined)
          append({ kind: "help", full: result.help === "full" });
        if (result.output !== undefined)
          append({ kind: "output", text: result.output });
        if (result.notice !== undefined)
          append({ kind: "system", text: result.notice });
        if (result.error !== undefined)
          append({ kind: "error", text: result.error });
        if (result.exit === true) exit();
        return;
      }

      busyRef.current = true;
      setBusy(true);

      try {
        await client.request({ type: "message", text }, onTurnEvent);
      } catch (error) {
        turnErrors.current.push(failureText(error, strings));
      }

      busyRef.current = false;
      setBusy(false);
      finishTurn();
    },
    [append, client, exit, finishTurn, onCommand, onTurnEvent, strings],
  );

  return (
    <>
      <Static items={rows}>
        {(row, index) =>
          row.kind === "welcome" ? (
            <Welcome key={row.id} content={welcome} />
          ) : (
            <RowView
              key={row.id}
              row={row}
              previous={rows[index - 1]}
              strings={strings}
              help={help}
            />
          )
        }
      </Static>

      {liveText.length > 0 ? (
        <RowView
          row={{ kind: "tutor", text: liveText }}
          strings={strings}
          help={help}
        />
      ) : null}

      {busy ? (
        <Thinking label={strings.thinking} />
      ) : (
        <Prompt onSubmit={(input) => void submit(input)} history={history} />
      )}
    </>
  );
}

/** What the learner reads when a request fails outside the tutor */
function failureText(error: unknown, strings: Catalog): string {
  if (error instanceof DaemonLostError) return strings.daemonLost;
  return error instanceof Error ? error.message : String(error);
}
