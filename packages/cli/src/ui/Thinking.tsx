import { Box, Text } from "ink";
import { useEffect, useState, type ReactElement } from "react";

import { glyphs, theme } from "./theme";

const PULSE_MS = 500;

export function Thinking({ label }: { label: string }): ReactElement {
  const [bright, setBright] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setBright((current) => !current), PULSE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <Box marginTop={1}>
      <Text color={bright ? theme.accent : theme.accentDim}>
        {glyphs.status}{" "}
      </Text>
      <Text color={theme.muted}>{label}…</Text>
    </Box>
  );
}
