import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useState, type ReactElement } from "react";

import { glyphs, theme } from "./theme";

interface PromptProps {
  onSubmit: (value: string) => void;
  /** Past submissions, most recent last, for arrow-key recall */
  history: string[];
}

export function Prompt({ onSubmit, history }: PromptProps): ReactElement {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);

  useInput((_input, key) => {
    if (key.upArrow) {
      const next =
        cursor === null ? history.length - 1 : Math.max(cursor - 1, 0);
      const recalled = history[next];
      if (recalled !== undefined) {
        setCursor(next);
        setValue(recalled);
      }
      return;
    }

    if (key.downArrow && cursor !== null) {
      const next = cursor + 1;
      if (next >= history.length) {
        setCursor(null);
        setValue("");
      } else {
        setCursor(next);
        setValue(history[next] ?? "");
      }
    }
  });

  const submit = (submitted: string): void => {
    setValue("");
    setCursor(null);
    onSubmit(submitted);
  };

  return (
    <Box marginTop={1}>
      <Text color={theme.accent}>{glyphs.prompt} </Text>
      <TextInput value={value} onChange={setValue} onSubmit={submit} />
    </Box>
  );
}
