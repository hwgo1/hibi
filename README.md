<div>

<h1 style="display: flex; justify-content: center; gap: 10px;">
  <img src="./site/public/assets/fox-lying.png" width="60">
  hibi 日々
</h1>

</div>

A programming tutor that runs in your terminal, reads the project you're working on, and teaches you to write the code yourself.

[![Status](https://img.shields.io/badge/status-experimental-8b7cf6?style=flat-square)](https://hibi-4xc.pages.dev/)
[![Bun](https://img.shields.io/badge/Bun-1.2%2B-000000?style=flat-square&logo=bun&logoColor=white)](https://bun.sh/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Full documentation [here](https://hibi-4xc.pages.dev/)!

## Why hibi exists

When you ask an AI assistant for help with code, you usually get working code. At work, that's exactly what you want. When you're learning, that's often the problem: you read the answer, it makes sense, you paste it, and a week later you still can't write it on your own.

hibi is built for that learning case. When you get stuck, it points to where the problem is before naming the problem, and names the problem before showing you the fix. When you say you're done, it runs your tests instead of reading your code and guessing. It remembers what you've shown you can do, so the next session can pick up where you left off, even in a different project.

## Install

You need [Bun](https://bun.sh) 1.2 or newer and an API key from OpenAI or Anthropic. git is optional, but without it hibi can't tell the code you wrote from code that came with a template.

```bash
bun install -g @hwgo1/hibi
```

Then open any project and run it:

```bash
cd ~/your-project
hibi
```

The first run asks for your language, what to call you, and your API key. It tests the key before saving it.

## Using it

Talk to it the way you would talk to a teacher:

```text
❯ I want to learn Go
❯ what is a variable?
❯ give me an exercise on lists
❯ I'm stuck, my code shows this error: …
```

Type `/help` for the short version and `/help all` for every command. `/undo` takes back the last answer, and `/profile` shows what hibi has recorded about you.

## How it works

hibi has no model of its own. You bring an API key from OpenAI or Anthropic, and hibi runs the conversation around that model: the teaching rules, the tools the model can call, and the record of your progress. You pay the provider directly, usually a few cents per question.

The limit on how much help you get is enforced in code, so a persuasive request can't talk the model past it. No tool writes the solution to an exercise, and the hint tool takes no depth argument. How far a hint goes depends on how many times you've tried and how long you've been stuck. If you ask for the answer outright, you get it, and that exercise counts for less in your record.

Everything hibi knows about you lives in `~/.hibi` on your computer. Your progress is an append-only log where each entry records where it came from, so a passing test weighs more than the model's opinion that your code looks right. The only data that leaves your machine is the conversation with the provider you chose.

A small background process per project holds the session, and the terminal interface is a thin client that talks to it over a local socket. The code is split into three packages: `core` is the tutor itself and has no disk or network access of its own, `daemon` is the background process, and `cli` is the interface.

## Status

hibi is at 0.1 and experimental. The terminal is the only interface, and the thresholds that decide when a hint escalates are first guesses that haven't been tested with other learners. If hibi helps you too early or too late, open an issue and say which exercise it was.
