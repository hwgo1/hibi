import type { Dictionary } from "./types";

export const en: Dictionary = {
  locale: "en",
  htmlLang: "en",
  ogLocale: "en_US",
  path: "/",
  meta: {
    title: "hibi 日々 · a programming tutor for your terminal",
    description: "A programming tutor that runs in your terminal, reads the project you're working on, and teaches you to write the code yourself."
  },
  nav: { install: "Install", docs: "Docs", built: "How it's built", status: "Status" },
  toc: { title: "On this page", docs: "Docs", top: "↑ back to top" },
  copy: { copy: "copy", copied: "copied ✓" },
  term: { skip: "skip", replay: "replay" },
  hero: {
    badge: "experimental · see where it's at →",
    tagline: "better every day",
    lead: "A programming tutor that runs in your terminal. It reads the project you're working on and helps you learn to write the code yourself.",
    primary: "Get started",
    secondary: "How it works",
    github: "GitHub",
    foxAlt: "the hibi fox lying on the terminal",
    pillars: [
      {
        title: "Hints in steps.",
        body: "When you're stuck, hibi first points to where the problem is. If you're still stuck, it tells you what the problem is. The fix comes last."
      },
      {
        title: "Checks by running.",
        body: "Say you're done and hibi runs your project's tests. A passing test counts for a lot more than the model's opinion of your code."
      },
      {
        title: "Remembers you.",
        body: "What you learn in one project carries over to the next, and all of it stays on your computer."
      }
    ],
    demoLabel: "Demo: a learner working on an exercise in hibi"
  },
  footer: { repo: "Repository", issues: "Issues", note: "日々 (hibi) means “day by day”." },
  demos: {
    session: {
      path: "~/code/pipeline",
      greeting: "Hi, Ana. What do you want to learn today?",
      hint: "Write however you like, ask for an exercise, or type /help.",
      thinking: "thinking",
      hintLabel: "hint {step} of 3",
      exchanges: [
        {
          input: "give me an exercise on channels",
          thinkMs: 1400,
          reply: "Write a function `Fanout` in internal/pipeline/fanout.go. It takes one input channel and returns three output channels, sending each value it receives to exactly one of them. When the input closes, all three outputs should close too.\n\nThere's already a test for it in fanout_test.go."
        },
        {
          input: "I think I'm done",
          thinkMs: 1200,
          reply: "Before I run the tests: the test starts three consumers and then closes the input. What do you expect to happen to the three output channels?"
        },
        {
          input: "they all close",
          thinkMs: 1900,
          reply: "Two of them closed and one didn't:\n```\n--- FAIL: TestFanoutClosesOutputs\n    fanout_test.go:42: output channel 2 was never closed\n```\nYou expected all three to close. Where in your code does each output channel get closed?"
        },
        {
          input: "no idea, can I get a hint?",
          thinkMs: 1300,
          hint: 1,
          reply: "Look at the end of `Fanout`, right after the loop over the input finishes. The idea involved is who is responsible for closing a channel."
        }
      ]
    },
    onboarding: {
      intro: "Hi! I'm hibi, a programming tutor.",
      introDetail: "I help you actually learn: I explain, suggest exercises and give hints,\nwithout handing over the answer. Before we start, I need a few things.",
      language: {
        title: "Language",
        question: "I'll speak American English. Press Enter to confirm, or type another (pt, es):"
      },
      name: { title: "Name", question: "What should I call you? (Enter to skip)", answer: "Ana" },
      key: {
        title: "Access key",
        explain: "hibi runs on another company's artificial intelligence, which charges per use —\nusually a few cents per question. You create a key on their site and paste it\nhere; the cost goes straight to your account.",
        provider: "Which company do you want to use?",
        choose: "Choose [1]:",
        where: "Create your key at: https://platform.openai.com/api-keys",
        prompt: "Paste the key here:",
        pasted: "sk-proj-7Rq2vXe9LmT4bNw83f9a",
        checking: "Testing the key…",
        ok: "it works!",
        saved: "It's stored only on your computer."
      },
      ready: "All set."
    }
  },
  sections: [
    {
      id: "why",
      toc: "Why it exists",
      group: "intro",
      eyebrow: "02 · why",
      title: "Why hibi exists",
      blocks: [
        {
          kind: "lead",
          text: "Ask an AI assistant for help with code and you'll get working code. At work, that's exactly what you want. When you're learning, it gets in the way. You read the answer, it makes sense, you paste it in, and a week later you can't write it on your own. You also can't tell which parts you understood, and neither can the assistant, because it never asked."
        },
        {
          kind: "lead",
          text: "hibi is built for learning. It holds the solution back on purpose and gives you more help as you keep trying. It checks your work by running it. And it keeps track of what you've shown you can do, so after a few weeks it knows where you're solid, where you're guessing, and what you haven't practised in a while."
        }
      ]
    },
    {
      id: "install",
      toc: "Install",
      group: "intro",
      eyebrow: "03 · install",
      title: "Install",
      blocks: [
        { kind: "p", text: "hibi is published on npm, so once you have Bun it takes one command." },
        { kind: "h3", text: "What you need" },
        {
          kind: "cards",
          items: [
            { label: "runtime", body: "[Bun](https://bun.sh) 1.2 or newer. It's the program that runs hibi." },
            {
              label: "model",
              body: "An API key from OpenAI or Anthropic. hibi uses one of their AI models, and the key works like a password that lets hibi use it on your account. You create it on their site and they bill you directly, usually a few cents per question."
            },
            {
              label: "optional",
              body: "git. Without it, hibi can't tell the code you wrote from code that came with a template."
            }
          ]
        },
        { kind: "h3", text: "With Bun" },
        { kind: "code", head: "bash", lines: ["bun install -g @hwgo1/hibi"], copyable: true },
        { kind: "h3", text: "From source" },
        { kind: "p", text: "If you want to read or change the code, install from the repository instead:" },
        {
          kind: "code",
          head: "bash",
          lines: [
            "git clone https://github.com/hwgo1/hibi",
            "cd hibi",
            "bun install",
            "cd packages/cli && bun link && cd ../..",
            "bun link @hwgo1/hibi"
          ],
          copyable: true
        },
        { kind: "h3", text: "First run" },
        {
          kind: "p",
          text: "Open a folder with your code and run `hibi`. The first time, it asks you three things:"
        },
        { kind: "terminal", demo: "onboarding" },
        {
          kind: "p",
          text: "Language comes first, so everything after it is already in your language. hibi tests the key before saving it and hides it on screen once you paste it. It also picks a recommended model for you, which you can change later with `/model`."
        }
      ]
    },
    {
      id: "quickstart",
      toc: "First five minutes",
      group: "intro",
      eyebrow: "04 · first five minutes",
      title: "Your first five minutes",
      blocks: [
        {
          kind: "ol",
          items: [
            {
              title: "Open a project.",
              body: "`cd` into a folder with your code and run `hibi`. The first time, it reads the project to find out the language, how the tests run, and which files you wrote."
            },
            {
              title: "Say what you want to learn.",
              body: "“I want to learn Go” and “what is a variable?” both work. If you mention a goal, hibi saves it and picks up from there next time."
            },
            {
              title: "Ask for an exercise.",
              body: "hibi writes the task and tells you which file to work in."
            },
            {
              title: "Try it, then say you're done.",
              body: "hibi runs your tests. If you get stuck, ask for a hint and watch it go from “look here” to “this is the problem”."
            },
            {
              title: "Type `/help`.",
              body: "You'll see examples of what to ask, plus the two commands you'll use most."
            }
          ]
        }
      ]
    },
    {
      id: "commands",
      toc: "Commands",
      group: "docs",
      eyebrow: "5.1 · docs",
      title: "Commands",
      pre: { eyebrow: "05 · documentation", title: "Documentation" },
      blocks: [
        {
          kind: "p",
          text: "Most of the time you talk to hibi in plain words. Commands are for when you want to look at what it has recorded or change a setting. `/help all` lists them in these same groups."
        },
        {
          kind: "table",
          title: "Your progress",
          columns: "minmax(150px,0.8fr) minmax(0,2fr)",
          mono: [true, false],
          rows: [
            [
              "/profile",
              "What hibi has recorded about you: preferences, goal, and how solid each topic is"
            ],
            [
              "/state",
              "What's open right now: the current exercise, how many hints you've had, questions waiting for an answer"
            ],
            [
              "/signals",
              "What hibi has noticed about how you learn, and how sure it is about each thing"
            ]
          ]
        },
        {
          kind: "table",
          title: "Conversation",
          columns: "minmax(150px,0.8fr) minmax(0,2fr)",
          mono: [true, false],
          rows: [
            ["/undo", "Takes back the last answer and removes it from your record"],
            ["/clear", "Clears the conversation. Your exercise, hints and progress stay"],
            ["/forget <topic>", "Removes everything recorded about one topic"]
          ]
        },
        {
          kind: "table",
          title: "Settings",
          columns: "minmax(150px,0.8fr) minmax(0,2fr)",
          mono: [true, false],
          rows: [
            ["/prefs", "Shows how hibi teaches you. `/prefs <name> <value>` changes a setting"],
            ["/model", "Lists the available models. `/model <name>` switches"],
            ["/provider", "Switches between OpenAI and Anthropic, if you've saved a key for both"],
            ["/reset", "Removes your saved key, so hibi asks for it again next time"]
          ]
        },
        {
          kind: "table",
          title: "Other",
          columns: "minmax(150px,0.8fr) minmax(0,2fr)",
          mono: [true, false],
          rows: [
            ["/help", "Examples of what to ask. `/help all` lists every command"],
            ["/index", "Re-reads your project's files after big changes"],
            ["/cost", "How much this conversation has cost so far"],
            ["/stop", "Shuts down hibi's background process"],
            ["/exit", "Leaves hibi"]
          ]
        },
        {
          kind: "note",
          text: "Command names stay in English whatever language you pick, since you're the one typing them. Their descriptions in `/help` follow your language."
        }
      ]
    },
    {
      id: "hints",
      toc: "Hints",
      group: "docs",
      eyebrow: "5.2 · docs",
      title: "Hints",
      blocks: [
        {
          kind: "p",
          text: "When you're stuck on an exercise, help comes in three steps. hibi shows which one you're on above its answer, as “hint 1 of 3”."
        },
        {
          kind: "steps",
          items: [
            {
              label: "step 1",
              text: "Points to the part of your code where the problem is and names the idea involved. It doesn't say what's wrong."
            },
            {
              label: "step 2",
              text: "Names the problem and shows exactly where it is. It doesn't write the fix."
            },
            {
              label: "step 3",
              text: "Shows the fix, explains why it works, and gives you a similar problem in a different setting to solve on your own."
            }
          ]
        },
        {
          kind: "subs",
          items: [
            {
              title: "The first hint",
              body: "It comes after your first try, or after about three minutes on the problem. A hint before any attempt tends not to stick."
            },
            {
              title: "Going up a step",
              body: "After two more tries, or about eight minutes without progress. On the same problem, the step never goes back down."
            },
            {
              title: "Starting at step 2",
              body: "If you ask about code you already wrote, hibi can skip step 1. You've already found the spot, so pointing at it would waste your time."
            },
            {
              title: "Asking for the answer",
              body: "Ask for it directly and you'll get it. That exercise then counts for less in your record, and hibi notes that you asked."
            }
          ]
        },
        {
          kind: "callout",
          title: "The model doesn't choose how much to reveal.",
          body: "The hint tool has no “depth” setting, and none of hibi's tools can write an exercise's solution. How far a hint goes is decided by code, from your attempts and the time you've spent."
        }
      ]
    },
    {
      id: "checking",
      toc: "Checking your work",
      group: "docs",
      eyebrow: "5.3 · docs",
      title: "Checking your work",
      blocks: [
        {
          kind: "p",
          text: "When you say you're done, hibi runs your project's own test command. Which one depends on the project:"
        },
        {
          kind: "chips",
          items: [
            { text: "go test ./..." },
            { text: "npm test" },
            { text: "cargo test" },
            { text: "pytest" }
          ]
        },
        {
          kind: "p",
          text: "It finds the command when it first reads your project and never takes it from the conversation, so nothing written in a file can change what runs."
        },
        {
          kind: "callout",
          title: "Missing tools don't count against you.",
          body: "If the tests fail because something is missing on your computer, like a compiler that isn't installed, hibi tells you and helps you fix it. That doesn't count as a failed attempt."
        },
        {
          kind: "stack",
          items: [
            {
              title: "No tests?",
              body: "Then hibi reads your code and judges it. That judgment counts for about a third of a real test in your record."
            }
          ]
        }
      ]
    },
    {
      id: "questions",
      toc: "Questions first",
      group: "docs",
      eyebrow: "5.4 · docs",
      title: "Questions before answers",
      blocks: [
        {
          kind: "p",
          text: "Sometimes hibi asks you something before it explains or runs anything. There are three kinds of question, and each one comes at a natural pause."
        },
        {
          kind: "stack",
          items: [
            {
              title: "Before a new topic",
              body: "It checks what you already know. If you use promises in JavaScript, it might ask whether you're comfortable with them and then explain Go's `select` by comparison. Or it asks something like “if two programs add to the same counter at once, what happens?” and starts from your answer."
            },
            {
              title: "Before running your tests",
              body: "It asks what you expect your code to do in this exercise. When the result proves you wrong, that's the best moment to fix how you picture it."
            },
            {
              title: "After an exercise",
              body: "It asks you to say in one line what the problem came down to. A summary that's almost right shows a gap the passing test hides."
            }
          ]
        },
        {
          kind: "p",
          text: "You can skip any question by carrying on with what you were doing. hibi asks at most once every four exchanges and six times per session, and if you skip two in a row it stops asking for the rest of the session. To turn questions off, use `/prefs unsolicitedHints never`."
        }
      ]
    },
    {
      id: "quizzes",
      toc: "Quizzes",
      group: "docs",
      eyebrow: "5.5 · docs",
      title: "Quizzes",
      blocks: [
        {
          kind: "p",
          text: "Running code doesn't show everything. Knowing when to use a lock is different from being able to write one, so hibi also asks multiple-choice questions."
        },
        {
          kind: "stack",
          items: [
            {
              title: "Three possible outcomes",
              body: "Right, wrong, or “I don't know”. Saying you don't know gets recorded as something to learn next and never counts as a mistake. A lucky guess would make your record less accurate."
            }
          ]
        },
        {
          kind: "chips",
          items: [
            { text: "right" },
            { text: "wrong" },
            { text: "I don't know", highlight: true }
          ]
        },
        {
          kind: "stack",
          items: [
            {
              title: "Wrong options you'd actually pick",
              body: "The wrong options are mistakes a learner could really make, and each one is tied to the misunderstanding behind it. When you pick one, hibi talks about that misunderstanding instead of only giving you the right answer."
            },
            {
              title: "No peeking",
              body: "The correct answer doesn't appear on screen until you've answered. hibi checks your answer in code, so the model can't be talked into marking it right."
            }
          ]
        }
      ]
    },
    {
      id: "goals",
      toc: "Goals",
      group: "docs",
      eyebrow: "5.6 · docs",
      title: "Goals",
      blocks: [
        {
          kind: "p",
          text: "Tell hibi what you're working toward: learning a language, getting ready for interviews, building a project. It saves that and brings it up when you come back (“Last time you were working on: learning Go”)."
        },
        {
          kind: "p",
          text: "When you ask what to do next, hibi suggests two or three topics from your record:"
        },
        {
          kind: "ul",
          items: [
            "ones you've never covered",
            "ones you've tried but aren't solid on yet",
            "ones you said you know but never showed",
            "ones you haven't touched in about three weeks"
          ]
        },
        {
          kind: "p",
          text: "It works these out fresh every session. There's no fixed syllabus, because a saved plan would be out of date the moment you learned something."
        },
        {
          kind: "p",
          text: "If you already know something it suggests, say so. hibi takes your word for it and moves on without testing you."
        }
      ]
    },
    {
      id: "knows",
      toc: "What hibi knows",
      group: "docs",
      eyebrow: "5.7 · docs",
      title: "What hibi knows about you",
      blocks: [
        { kind: "p", text: "hibi keeps two kinds of records." },
        {
          kind: "cards",
          items: [
            {
              title: "The log",
              file: "evidence.jsonl",
              body: "Everything that happened, one entry at a time. Entries are never edited or deleted, only added.",
              sample: "on September 12, goroutines, tests ran, passed, after one hint"
            },
            {
              title: "The estimate",
              file: "profile.json",
              body: "How well hibi thinks you know each topic. It's calculated from the log, so when the formula improves, your whole history gets recalculated with it.",
              sample: "0.62 on goroutines, with confidence 0.40"
            }
          ]
        },
        { kind: "h3", text: "Where each piece of evidence comes from" },
        {
          kind: "p",
          text: "A passing test is a fact. A right answer on a quiz is an observation. The model deciding your code looks right is an opinion. Each entry in the log says which one it is, and that decides how much it counts."
        },
        {
          kind: "weights",
          head: ["Source", "Weight", "Example"],
          rows: [
            { source: "Test run", weight: 1, example: "Your tests ran and passed or failed" },
            { source: "Quiz answer", weight: 0.8, example: "You answered a multiple-choice question" },
            { source: "Behaviour", weight: 0.5, example: "Something hibi observed in your project" },
            {
              source: "Model's judgment",
              weight: 0.35,
              example: "The model read your code and thought it was right"
            },
            { source: "Your own word", weight: 0.15, example: "You said you know it" },
            { source: "hibi's own actions", weight: 0, example: "hibi explained something or gave a hint" }
          ]
        },
        {
          kind: "p",
          text: "On top of that, solving something on your own counts in full, and solving it after seeing the fix counts about a third. Asking for the answer outright halves that again."
        },
        {
          kind: "bars",
          rows: [
            { label: "On your own", percent: 100, value: "full" },
            { label: "After seeing the fix", percent: 33, value: "≈ ⅓" },
            { label: "Asked for the answer", percent: 17, value: "≈ ⅙" }
          ]
        },
        { kind: "h3", text: "Confidence" },
        {
          kind: "p",
          text: "Every estimate comes with how much hibi trusts it. A low score with low confidence means hibi doesn't know much about you on that topic yet. hibi never shows a score without its confidence."
        },
        {
          kind: "output",
          command: "/profile",
          lines: [
            [
              { text: "mastery", tone: "bold" }
            ],
            [
              { text: "  goroutines: 0.62 " },
              { text: "(confidence 0.40, 3 direct)", tone: "dim" }
            ]
          ]
        },
        { kind: "h3", text: "What hibi has noticed" },
        {
          kind: "p",
          text: "Once there's enough evidence, hibi starts to notice patterns in how you learn. `/signals` lists them, with how sure it is about each:"
        },
        {
          kind: "output",
          command: "/signals",
          lines: [
            [
              { text: "observed tendencies", tone: "bold" }
            ],
            [
              { text: "  self-assessment = tends to overestimate " },
              { text: "(55%, 12 events)", tone: "dim" }
            ],
            [
              { text: "  hint-depth = usually unblocks at the first hint " },
              { text: "(50%, 10 events)", tone: "dim" }
            ],
            [
              { text: "  these are guesses — declare the opposite with /prefs to override one", tone: "dim" }
            ]
          ]
        },
        {
          kind: "p",
          text: "The first line compares what this learner predicted before running the tests with what happened: they usually expected to pass before they actually did."
        },
        {
          kind: "p",
          text: "These are guesses, and they only show up after at least eight related events. Anything you set in `/prefs` always wins over something hibi guessed."
        },
        { kind: "h3", text: "Topics" },
        {
          kind: "p",
          text: "Topics form a tree that grows as you learn. “linked list”, “linked lists” and “lista encadeada” all count as the same topic."
        },
        {
          kind: "chips",
          items: [
            { text: "linked list" },
            { text: "linked lists" },
            { text: "lista encadeada" },
            { text: "→", arrow: true },
            { text: "one topic", highlight: true }
          ]
        },
        {
          kind: "p",
          text: "Progress on a specific topic also counts, a bit less, toward the broader ones above it. Solving something about goroutines adds a little to concurrency too."
        }
      ]
    },
    {
      id: "disagree",
      toc: "Disagreeing",
      group: "docs",
      eyebrow: "5.8 · docs",
      title: "Disagreeing with a number",
      blocks: [
        {
          kind: "p",
          text: "If hibi says your score on pointers is 0.2 and you think that's wrong, tell it. The number won't change because you asked. hibi offers a quiz or an exercise on pointers instead, and the result moves the score."
        },
        {
          kind: "p",
          text: "Disagreeing costs nothing and never lowers a score by itself. If you dispute the same topic again, the next result counts a little less. hibi still accepts the dispute and offers another quiz."
        }
      ]
    },
    {
      id: "undo",
      toc: "Undo and forget",
      group: "docs",
      eyebrow: "5.9 · docs",
      title: "Undo and forget",
      blocks: [
        {
          kind: "stack",
          items: [
            {
              title: "`/undo`",
              body: "Takes back the last exchange. Whatever it recorded about you stops counting. The conversation itself stays on screen."
            },
            { title: "`/forget <topic>`", body: "Does the same for everything recorded about one topic." }
          ]
        },
        {
          kind: "p",
          text: "Both work by adding a note to the log that cancels the earlier entries, so your history stays complete and can still be recalculated."
        },
        {
          kind: "callout",
          title: "`/forget all forget`",
          body: "This one is the exception. It deletes your whole learning history for good. Typing the word twice is the confirmation."
        }
      ]
    },
    {
      id: "settings",
      toc: "Settings",
      group: "docs",
      eyebrow: "5.10 · docs",
      title: "Settings",
      blocks: [
        { kind: "p", text: "Change these with `/prefs <name> <value>`." },
        {
          kind: "table",
          head: ["Setting", "Values", "Default"],
          columns: "minmax(140px,1fr) minmax(0,1.5fr) minmax(0,1.2fr)",
          minWidth: "560px",
          mono: [true, false, false],
          rows: [
            ["name", "any text", "what you gave at first run"],
            ["language", "a language code like `pt-BR`", "detected from your computer"],
            ["theoryDepth", "`minimal`, `balanced`, `thorough`", "`balanced`"],
            ["exerciseSize", "`small`, `medium`, `large`", "`medium`"],
            ["unsolicitedHints", "`never`, `when-stuck`, `proactive`", "`when-stuck`"],
            ["explanationStyle", "`concise`, `detailed`", "`concise`"]
          ]
        },
        {
          kind: "p",
          text: "There's no setting for how much hibi holds back. You can change how it teaches, but the step-by-step hints always apply."
        }
      ]
    },
    {
      id: "data",
      toc: "Your data",
      group: "docs",
      eyebrow: "5.11 · docs",
      title: "Where your data lives",
      blocks: [
        {
          kind: "p",
          text: "Everything stays on your computer, in a folder called `.hibi` in your home directory:"
        },
        {
          kind: "tree",
          items: [
            { path: "~/.hibi/", note: "" },
            { path: "  credentials.json", note: "your API key, readable only by you" },
            { path: "  profile.json", note: "your preferences, goal and scores" },
            { path: "  concepts.json", note: "your topic tree" },
            { path: "  evidence.jsonl", note: "the log of everything that happened" },
            { path: "  repos/<id>/", note: "" },
            { path: "    repo.json", note: "what hibi learned about that project" },
            { path: "    session.json", note: "the current exercise, hints and questions" }
          ]
        },
        {
          kind: "p",
          text: "Your scores, topics and log are shared across projects. The session and project details belong to each project."
        },
        {
          kind: "p",
          text: "The only thing that leaves your computer is the conversation with the AI company you picked, sent with your own key."
        },
        { kind: "p", text: "To start over completely, delete the folder:" },
        { kind: "code", head: "bash", lines: ["rm -rf ~/.hibi"], copyable: true }
      ]
    },
    {
      id: "built",
      toc: "How it's built",
      group: "meta",
      eyebrow: "06 · how it's built",
      title: "How it's built",
      blocks: [
        {
          kind: "diagram",
          labels: {
            cli: "hibi cli",
            cliNote: "the terminal, a thin client",
            editor: "editor panel",
            editorNote: "planned",
            socket: "socket",
            daemon: "background process",
            daemonNote: "one per project · holds the session",
            core: "core",
            coreNote: "the tutor · no disk, no network",
            disk: "~/.hibi/",
            diskNote: "session, topics, log",
            model: "AI provider",
            modelNote: "your key · the only outside connection"
          }
        },
        {
          kind: "p",
          text: "hibi has no AI model of its own. It runs the conversation around the model you choose: the teaching rules, the tools the model is allowed to call, and the record of your progress."
        },
        {
          kind: "p",
          text: "Each project gets a small background process that holds the session. The terminal interface is a thin client that talks to it over a local socket, so a future editor panel could join the same session."
        },
        {
          kind: "p",
          text: "hibi doesn't rely on the conversation text to keep track of things. The current exercise, the hint step and your history are saved to disk and rebuilt for every message. You can clear the conversation in the middle of an exercise and hibi still knows where you were."
        },
        {
          kind: "p",
          text: "The code is TypeScript on Bun, split into three packages. `core` is the tutor and has no disk or network access of its own; everything goes through small interfaces. `daemon` is the background process. `cli` is the terminal interface."
        }
      ]
    },
    {
      id: "status",
      toc: "Project status",
      group: "meta",
      eyebrow: "07 · status",
      title: "Where the project is",
      blocks: [
        {
          kind: "p",
          text: "hibi is at 0.1 and still experimental. Everything on this page works, and its author uses it every day."
        },
        {
          kind: "notyet",
          head: "not yet",
          badge: "0.1 · experimental",
          items: [
            {
              title: "Other interfaces",
              body: "The terminal is the only one so far. The background process is ready for an editor panel, but there isn't one yet."
            },
            {
              title: "Plain-language output",
              body: "What `/profile`, `/state` and `/signals` print is still in English and fairly technical."
            }
          ]
        },
        {
          kind: "p",
          text: "The numbers that decide when a hint goes up a step (two attempts, eight minutes, three minutes before the first hint) and how often hibi asks questions are first guesses. Nobody besides the author has tested them yet. If hibi helps you too early or too late, [open an issue](https://github.com/hwgo1/hibi/issues) and say which exercise it was."
        }
      ]
    }
  ]
};
