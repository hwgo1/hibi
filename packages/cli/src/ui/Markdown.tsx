import { Box, Text } from "ink";
import type { ReactElement } from "react";

import { parseBlocks, type Segment } from "./parse-markdown";
import { glyphs, theme } from "./theme";

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps): ReactElement {
  const blocks = parseBlocks(content);

  return (
    <Box flexDirection="column">
      {blocks.map((block, blockIndex) =>
        block.kind === "code" ? (
          <Box key={blockIndex} flexDirection="column" marginY={1}>
            {block.language !== undefined && (
              <Text color={theme.muted}>{block.language}</Text>
            )}
            {block.lines.map((line, lineIndex) => (
              <Text key={lineIndex}>
                <Text color={theme.muted}>{glyphs.gutter} </Text>
                {line[0]?.text || " "}
              </Text>
            ))}
          </Box>
        ) : (
          <Box key={blockIndex} flexDirection="column">
            {block.lines.map((line, lineIndex) => (
              <Text key={lineIndex}>{renderLine(line)}</Text>
            ))}
          </Box>
        ),
      )}
    </Box>
  );
}

function renderLine(line: Segment[]): ReactElement[] | string {
  if (line.every((segment) => segment.text.length === 0)) return " ";

  return line.map((segment, index) => (
    <Text
      key={index}
      color={segment.color}
      bold={segment.bold}
      dimColor={segment.dim}
    >
      {segment.text}
    </Text>
  ));
}
