import { describe, expect, test } from "bun:test";

import { isCodeFile, isGenerated, languageOf } from "../src/repo/ignore";

describe("isCodeFile", () => {
  test("accepts a language this project has no parser for", () => {
    expect(isCodeFile("main.zig")).toBe(true);
    expect(isCodeFile("Lib.hs")).toBe(true);
    expect(isCodeFile("app.rb")).toBe(true);
  });

  test("accepts an extension nothing here knows about", () => {
    expect(isCodeFile("thing.gleam")).toBe(true);
  });

  test("rejects assets and binaries", () => {
    expect(isCodeFile("logo.png")).toBe(false);
    expect(isCodeFile("app.wasm")).toBe(false);
    expect(isCodeFile("data.sqlite3")).toBe(false);
  });

  test("rejects a file with no extension", () => {
    expect(isCodeFile("Makefile")).toBe(false);
    expect(isCodeFile("LICENSE")).toBe(false);
  });

  test("is case-insensitive", () => {
    expect(isCodeFile("IMAGE.PNG")).toBe(false);
    expect(isCodeFile("Main.GO")).toBe(true);
  });
});

describe("isGenerated", () => {
  test("flags lockfiles and machine-written sources", () => {
    expect(isGenerated("bun.lockb")).toBe(true);
    expect(isGenerated("service.pb.go")).toBe(true);
    expect(isGenerated("bundle.min.js")).toBe(true);
  });

  test("leaves ordinary sources alone", () => {
    expect(isGenerated("main.go")).toBe(false);
  });
});

describe("languageOf", () => {
  test("names a known extension", () => {
    expect(languageOf("main.go")).toBe("Go");
    expect(languageOf("App.tsx")).toBe("TypeScript");
  });

  test("returns null for an unmapped extension without excluding the file", () => {
    expect(languageOf("thing.gleam")).toBeNull();
    expect(isCodeFile("thing.gleam")).toBe(true);
  });
});
