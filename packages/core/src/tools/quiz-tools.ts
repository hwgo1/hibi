import { z } from "zod";

import type { ConceptId } from "../concepts";
import { resolveConcept, validateConceptTerm } from "../concept-resolver";
import { disputeWeight, scoreResponse } from "../quiz/scoring";
import {
  OPEN_QUIZ_SCHEMA_VERSION,
  QUIZ_MAX_OPTIONS,
  QUIZ_MIN_OPTIONS,
  QuizQuestionSchema,
  QuizResponseSchema,
  type QuizQuestion,
} from "../schemas/quiz";
import { DISPUTE_SCHEMA_VERSION } from "../schemas/quiz";
import type { ToolContext } from "./context";
import type { Tool } from "./registry";

const MAX_QUESTIONS = 5;

const AskQuizArgs = z.object({
  conceptTerm: z.string().min(1),
  parentTerm: z.string().min(1).optional(),
  questions: z
    .array(QuizQuestionSchema.omit({ conceptId: true, id: true }))
    .min(1)
    .max(MAX_QUESTIONS),
});

/** Opens a quiz on a concept */
export const askQuiz: Tool<ToolContext> = {
  definition: {
    name: "ask_quiz",
    description:
      "Ask multiple-choice questions to check conceptual understanding, which running code does not measure. Wrong options must be plausible and each must state the misconception it represents.",
    parameters: {
      type: "object",
      properties: {
        conceptTerm: {
          type: "string",
          description: "The topic in English, at most four words.",
        },
        parentTerm: {
          type: "string",
          description: "A broader existing concept.",
        },
        questions: {
          type: "array",
          maxItems: MAX_QUESTIONS,
          items: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "The question, in the user's language.",
              },
              options: {
                type: "array",
                minItems: QUIZ_MIN_OPTIONS,
                maxItems: QUIZ_MAX_OPTIONS,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Short slug: a, b, c." },
                    text: { type: "string" },
                    misconception: {
                      type: "string",
                      description:
                        "For wrong options only: the specific mistaken belief that leads here.",
                    },
                  },
                  required: ["id", "text"],
                },
              },
              correctOptionId: { type: "string" },
              explanation: {
                type: "string",
                description:
                  "Why the correct answer is correct, shown after answering.",
              },
            },
            required: ["prompt", "options", "correctOptionId", "explanation"],
          },
        },
      },
      required: ["conceptTerm", "parentTerm", "questions"],
    },
  },

  async execute(rawArgs, context) {
    const args = AskQuizArgs.parse(rawArgs);

    const problem = validateConceptTerm(args.conceptTerm);
    if (problem !== null)
      return { content: `Not a concept: ${problem}`, isError: true };

    const outcome = resolveConcept(context.registry, args.conceptTerm, {
      parentHint: args.parentTerm as ConceptId | undefined,
      now: context.clock.now(),
    });
    if (outcome.status === "ambiguous") {
      return { content: "Ambiguous concept. Ask the user which one." };
    }
    context.registry = outcome.registry;

    const invalid = args.questions.find(
      (question) =>
        !question.options.some(
          (option) => option.id === question.correctOptionId,
        ),
    );
    if (invalid !== undefined) {
      return {
        content: "correctOptionId does not match any option",
        isError: true,
      };
    }

    const questions: QuizQuestion[] = args.questions.map((question, index) => ({
      ...question,
      id: `q${index + 1}`,
      conceptId: outcome.concept.id,
    }));

    context.session.openQuiz = {
      schemaVersion: OPEN_QUIZ_SCHEMA_VERSION,
      questions,
      cursor: 0,
      askedAt: context.clock.now().toISOString(),
      disputeOf: pendingDispute(context, outcome.concept.id),
    };

    return { content: renderQuestion(questions[0]!, 1, questions.length) };
  },
};

const AnswerArgs = z.object({
  optionId: z.string().min(1).optional(),
  response: QuizResponseSchema.optional(),
});

/** Records an answer to the open question and advances the quiz */
export const answerQuiz: Tool<ToolContext> = {
  definition: {
    name: "answer_quiz",
    description:
      "Record the user's answer to the open quiz question. Pass optionId for a choice, or response 'unknown' when they say they do not know.",
    parameters: {
      type: "object",
      properties: {
        optionId: {
          type: "string",
          description: "The option the user picked.",
        },
        response: {
          type: "string",
          enum: ["unknown"],
          description:
            "Use when the user says they do not know rather than guessing.",
        },
      },
      required: [],
    },
  },

  async execute(rawArgs, context) {
    const args = AnswerArgs.parse(rawArgs);
    const quiz = context.session.openQuiz;

    if (quiz === null) {
      return { content: "no quiz is open", isError: true };
    }

    const question = quiz.questions[quiz.cursor];
    if (question === undefined) {
      context.session.openQuiz = null;
      return { content: "the quiz is already finished", isError: true };
    }

    const response =
      args.response === "unknown"
        ? "unknown"
        : args.optionId === question.correctOptionId
          ? "correct"
          : "incorrect";

    const scored = scoreResponse(response, question.options.length);
    const disputeFactor =
      quiz.disputeOf === undefined
        ? 1
        : disputeWeight(priorDisputes(context, quiz.disputeOf) - 1);

    context.pendingEvidence.push({
      kind: response === "unknown" ? "self_assessment" : "quiz_answered",
      conceptId: question.conceptId,
      provenance: scored.provenance,
      confidence: scored.confidence * disputeFactor,
      outcome: scored.outcome,
      note: question.id,
    });

    quiz.cursor += 1;
    const next = quiz.questions[quiz.cursor];

    if (next === undefined) {
      context.session.openQuiz = null;
      settleDispute(context, quiz.disputeOf);
      return {
        content: `${verdict(response, question)}\n\nThe quiz is finished. Summarize how it went.`,
      };
    }

    return {
      content: `${verdict(response, question)}\n\n${renderQuestion(next, quiz.cursor + 1, quiz.questions.length)}`,
    };
  },
};

const DisputeArgs = z.object({
  conceptTerm: z.string().min(1),
});

/** Opens a challenge to a mastery estimate */
export const disputeMastery: Tool<ToolContext> = {
  definition: {
    name: "dispute_mastery",
    description:
      "Use when the user says a mastery estimate is wrong. Opens a challenge; follow it with ask_quiz or propose_exercise on that concept so the result can settle it.",
    parameters: {
      type: "object",
      properties: {
        conceptTerm: {
          type: "string",
          description: "The concept being disputed, in English.",
        },
      },
      required: ["conceptTerm"],
    },
  },

  async execute(rawArgs, context) {
    const args = DisputeArgs.parse(rawArgs);

    const problem = validateConceptTerm(args.conceptTerm);
    if (problem !== null)
      return { content: `Not a concept: ${problem}`, isError: true };

    const outcome = resolveConcept(context.registry, args.conceptTerm, {
      now: context.clock.now(),
    });
    if (outcome.status === "ambiguous") {
      return { content: "Ambiguous concept. Ask the user which one." };
    }
    context.registry = outcome.registry;

    const conceptId = outcome.concept.id;
    const entry = context.learner.mastery.find(
      (mastery) => mastery.conceptId === conceptId,
    );

    context.session.disputes.push({
      schemaVersion: DISPUTE_SCHEMA_VERSION,
      conceptId,
      disputedLevel: entry?.level ?? 0,
      raisedAt: context.clock.now().toISOString(),
      status: "open",
    });

    const repeat = priorDisputes(context, conceptId) > 1;

    return {
      content:
        `Dispute opened on ${outcome.concept.canonicalName}. ` +
        `The estimate stays as it is until something is demonstrated: ask a quiz or set an exercise on this concept. ` +
        (repeat
          ? `This concept has been disputed before, so the result counts for less.`
          : ``),
    };
  },
};

function renderQuestion(
  question: QuizQuestion,
  index: number,
  total: number,
): string {
  const options = question.options
    .map((option) => `  ${option.id}) ${option.text}`)
    .join("\n");

  return [
    `Question ${index} of ${total}. Present it exactly as written, in the user's language,`,
    `and offer "I don't know" as an honest choice alongside the options.`,
    `Do not reveal which is correct.`,
    ``,
    question.prompt,
    options,
  ].join("\n");
}

/**
 * What the tutor should say about an answer. A wrong choice returns the
 * misconception behind it when the question supplied one, so the reply
 * addresses the specific mistaken belief rather than only the error
 */
function verdict(
  response: "correct" | "incorrect" | "unknown",
  question: QuizQuestion,
): string {
  if (response === "correct") {
    return `Correct. Confirm briefly and give the explanation: ${question.explanation}`;
  }

  if (response === "unknown") {
    return `The user does not know this. Teach it directly: ${question.explanation}`;
  }

  const wrong = question.options.filter(
    (option) => option.id !== question.correctOptionId,
  );
  const notes = wrong
    .filter((option) => option.misconception !== undefined)
    .map((option) => `${option.id}: ${option.misconception}`)
    .join("; ");

  return [
    `Incorrect. Address the misconception rather than only marking it wrong.`,
    notes.length > 0 ? `Known misconceptions: ${notes}` : ``,
    `Correct answer: ${question.correctOptionId}. ${question.explanation}`,
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function priorDisputes(context: ToolContext, conceptId: ConceptId): number {
  return context.session.disputes.filter(
    (dispute) => dispute.conceptId === conceptId,
  ).length;
}

function pendingDispute(
  context: ToolContext,
  conceptId: ConceptId,
): ConceptId | undefined {
  const open = context.session.disputes.find(
    (dispute) => dispute.conceptId === conceptId && dispute.status === "open",
  );
  return open?.conceptId;
}

function settleDispute(
  context: ToolContext,
  conceptId: ConceptId | undefined,
): void {
  if (conceptId === undefined) return;

  const dispute = context.session.disputes.find(
    (entry) => entry.conceptId === conceptId && entry.status === "open",
  );
  if (dispute === undefined) return;

  const current = context.learner.mastery.find(
    (entry) => entry.conceptId === conceptId,
  );
  dispute.status =
    current !== undefined && current.level > dispute.disputedLevel
      ? "overturned"
      : "upheld";
}
