export interface FileEntry {
  path: string;
  bytes: number;
}

export interface ListFilesOptions {
  subpath?: string;
  limit: number;
  cursor?: string;
}

export interface ListFilesResult {
  entries: FileEntry[];
  nextCursor?: string;
  truncated: boolean;
}

export interface FileContent {
  path: string;
  text: string;
  contentHash: string;
  /** True when the content came from an unsaved editor buffer */
  dirty: boolean;
}

export interface ActiveDocument {
  path: string;
  contentHash: string;
  cursorLine?: number;
  selection?: string;
}

/**
 * Read access to the learner's code. Implemented over the filesystem in the CLI
 * and over editor buffers in the LSP and VS Code hosts
 */
export interface Workspace {
  readonly root: string;
  listFiles(options: ListFilesOptions): Promise<ListFilesResult>;
  readFile(path: string): Promise<FileContent>;
  /** Null in headless hosts with no editor attached */
  activeDocument(): Promise<ActiveDocument | null>;
}
