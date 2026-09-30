import { Box, Text } from "ink";
import type { ReactElement } from "react";

import type { HelpCommand, HelpContent } from "../help";
import { glyphs, theme } from "./theme";

const COLUMN_GAP = 3;

interface HelpViewProps {
  content: HelpContent;
  full: boolean;
}

export function HelpView({ content, full }: HelpViewProps): ReactElement {
  return full ? (
    <FullHelp content={content} />
  ) : (
    <ShortHelp content={content} />
  );
}

function ShortHelp({ content }: { content: HelpContent }): ReactElement {
  return (
    <Box flexDirection="column">
      <Text>{content.intro}</Text>
      <Box flexDirection="column" marginY={1}>
        {content.examples.map((example) => (
          <Text key={example}>
            <Text color={theme.accentDim}>{glyphs.prompt} </Text>
            <Text color={theme.muted}>{example}</Text>
          </Text>
        ))}
      </Box>
      <CommandList
        commands={content.essentials}
        width={columnWidth(content.essentials)}
      />
      <Box marginTop={1}>
        <Text color={theme.muted}>{content.more}</Text>
      </Box>
    </Box>
  );
}

function FullHelp({ content }: { content: HelpContent }): ReactElement {
  const width = columnWidth(
    content.sections.flatMap((section) => section.commands),
  );

  return (
    <Box flexDirection="column">
      {content.sections.map((section, index) => (
        <Box
          key={section.title}
          flexDirection="column"
          marginTop={index === 0 ? 0 : 1}
        >
          <Text bold>{section.title}</Text>
          <Box paddingLeft={2}>
            <CommandList commands={section.commands} width={width} />
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function CommandList({
  commands,
  width,
}: {
  commands: HelpCommand[];
  width: number;
}): ReactElement {
  return (
    <Box flexDirection="column">
      {commands.map((entry) => (
        <Text key={entry.command}>
          <Text color={theme.accent}>{entry.command.padEnd(width)}</Text>
          <Text>{entry.description}</Text>
        </Text>
      ))}
    </Box>
  );
}

function columnWidth(commands: HelpCommand[]): number {
  let longest = 0;
  for (const entry of commands) {
    if (entry.command.length > longest) longest = entry.command.length;
  }
  return longest + COLUMN_GAP;
}
