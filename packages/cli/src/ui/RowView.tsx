import { Box, Text } from "ink";
import type { ReactElement } from "react";

import type { HelpContent } from "../help";
import { fill, type Catalog } from "../i18n";
import { HelpView } from "./HelpView";
import { Markdown } from "./Markdown";
import { glyphs, theme } from "./theme";
import type { RowInput } from "./types";

interface RowViewProps {
  row: RowInput;
  /** The row above, which decides the spacing */
  previous?: RowInput;
  strings: Catalog;
  help: HelpContent;
}

export function RowView({
  row,
  previous,
  strings,
  help,
}: RowViewProps): ReactElement | null {
  const marginTop = spacing(row, previous);

  switch (row.kind) {
    case "welcome":
      return null;

    case "user":
      return (
        <Box marginTop={marginTop}>
          <Text color={theme.accentDim}>{glyphs.prompt} </Text>
          <Text color={theme.muted}>{row.text}</Text>
        </Box>
      );

    case "tutor":
      return (
        <Box marginTop={marginTop} paddingLeft={2} flexDirection="column">
          {row.step !== undefined ? (
            <Text color={theme.accentDim}>
              {fill(strings.hintOf, { step: String(row.step) })}
            </Text>
          ) : null}
          <Markdown content={row.text} />
        </Box>
      );

    case "output":
      return (
        <Box marginTop={marginTop} paddingLeft={2}>
          <Text>{row.text}</Text>
        </Box>
      );

    case "system":
      return (
        <Box marginTop={marginTop} paddingLeft={2}>
          <Text color={theme.muted}>{row.text}</Text>
        </Box>
      );

    case "error":
      return (
        <Box marginTop={marginTop} paddingLeft={2}>
          <Text color={theme.error}>
            {glyphs.error} {row.text}
          </Text>
        </Box>
      );

    case "help":
      return (
        <Box marginTop={marginTop} paddingLeft={2}>
          <HelpView content={help} full={row.full} />
        </Box>
      );
  }
}

/** Consecutive notices stack */
function spacing(row: RowInput, previous: RowInput | undefined): number {
  if (previous === undefined) return 1;
  if (
    row.kind === "system" &&
    (previous.kind === "system" || previous.kind === "output")
  ) {
    return 0;
  }
  return 1;
}
