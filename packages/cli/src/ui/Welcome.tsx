import { Box, Text } from "ink";
import type { ReactElement } from "react";

import { theme } from "./theme";

export interface WelcomeContent {
  path: string;
  lines: Array<{ text: string; dim: boolean }>;
}

export function Welcome({
  content,
}: {
  content: WelcomeContent;
}): ReactElement {
  return (
    <Box flexDirection="column">
      <Text>
        <Text bold color={theme.accent}>
          hibi
        </Text>
        <Text color={theme.muted}> 日々 {content.path}</Text>
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {content.lines.map((line) => (
          <Text key={line.text} color={line.dim ? theme.muted : undefined}>
            {line.text}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
