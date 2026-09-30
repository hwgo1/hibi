export type Row =
  | { id: number; kind: "welcome" }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "tutor"; text: string; step?: 1 | 2 | 3 }
  | { id: number; kind: "output"; text: string }
  | { id: number; kind: "system"; text: string }
  | { id: number; kind: "error"; text: string }
  | { id: number; kind: "help"; full: boolean };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

export type RowInput = DistributiveOmit<Row, "id">;
