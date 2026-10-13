import { z } from "zod";

import type { ConceptId } from "../concepts";
import { disputeWeight, scoreResponse } from "../quiz/scoring";
import {
  OPEN_QUIZ_SCHEMA_VERSION,
  QuizQuestionSchema,
  type QuizQuestion,
} from "../schemas/quiz";
import { ConceptTermArg, ParentTermArg, resolveTerm } from "./concept-term";
import type { ToolContext } from "./context";
import { defineTool, type Tool } from "./registry";

const MAX_QUESTIONS = 5;

/** Opens a quiz on a concept */
export const askQuiz: Tool<ToolContext> = defineTool({
  name: "ask_quiz",
  description:
    "Ask multiple-choice questions to check conceptual understanding, which running code does not measure. Wrong options must be plausible and each must state the misconception it represents.",
  args: z.object({
    conceptTerm: ConceptTermArg,
    parentTerm: ParentTermArg,
    questions: z
      .array(QuizQuestionSchema.omit({ conceptId: true, id: true }))
      .min(1)
      .max(MAX_QUESTIONS)
      .describe("One to five questions on this concept, asked in order."),
  }),

  async execute(args, context: ToolContext) {
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

    const resolved = resolveTerm(context, args.conceptTerm, args.parentTerm);
    if (!resolved.ok) return resolved.outcome;
    const concept = resolved.concept;

    const questions: QuizQuestion[] = args.questions.map((question, index) => ({
      ...question,
      id: `q${index + 1}`,
      conceptId: concept.id,
    }));

    context.session.openQuiz = {
      schemaVersion: OPEN_QUIZ_SCHEMA_VERSION,
      questions,
      cursor: 0,
      askedAt: context.clock.now().toISOString(),
      disputeWeight:
        context.session.dispute?.conceptId === concept.id
          ? context.session.dispute.weight
          : undefined,
    };

    return { content: renderQuestion(questions[0]!, 1, questions.length) };
  },
});

/** Records an answer to the open question and advances the quiz */
export const answerQuiz: Tool<ToolContext> = defineTool({
  name: "answer_quiz",
  description:
    "Record the user's answer to the open quiz question. Pass optionId for a choice, or response 'unknown' when they say they do not know.",
  args: z.object({
    optionId: z
      .string()
      .min(1)
      .optional()
      .describe("The option the user picked."),
    response: z
      .enum(["unknown"])
      .optional()
      .describe(
        "Use when the user says they do not know rather than guessing.",
      ),
  }),

  async execute(args, context: ToolContext) {
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
    const disputeFactor = quiz.disputeWeight ?? 1;

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
      if (quiz.disputeWeight !== undefined) context.session.dispute = null;
      return {
        content: `${verdict(response, question)}\n\nThe quiz is finished. Summarize how it went.`,
      };
    }

    return {
      content: `${verdict(response, question)}\n\n${renderQuestion(next, quiz.cursor + 1, quiz.questions.length)}`,
    };
  },
});

/** Opens a challenge to a mastery estimate */
export const disputeMastery: Tool<ToolContext> = defineTool({
  name: "dispute_mastery",
  description:
    "Use when the user says a mastery estimate is wrong. Opens a challenge; follow it with ask_quiz or propose_exercise on that concept so the result can settle it.",
  args: z.object({ conceptTerm: ConceptTermArg }),

  async execute(args, context: ToolContext) {
    const resolved = resolveTerm(context, args.conceptTerm);
    if (!resolved.ok) return resolved.outcome;

    const conceptId = resolved.concept.id;
    const prior = await priorDisputes(context, conceptId);

    context.session.dispute = {
      conceptId,
      weight: disputeWeight(prior),
      raisedAt: context.clock.now().toISOString(),
    };
    context.pendingEvidence.push({
      kind: "mastery_disputed",
      conceptId,
      provenance: "system",
    });

    const repeat = prior > 0;

    return {
      content:
        `Dispute opened on ${resolved.concept.canonicalName}. ` +
        `The estimate stays as it is until something is demonstrated: ask a quiz or set an exercise on this concept. ` +
        (repeat
          ? `This concept has been disputed before, so the result counts for less.`
          : ``),
    };
  },
});

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

async function priorDisputes(
  context: ToolContext,
  conceptId: ConceptId,
): Promise<number> {
  const logged = await context.storage.queryEvidence({
    userId: context.session.userId,
    conceptId,
  });
  const isDispute = (event: { kind: string }): boolean =>
    event.kind === "mastery_disputed";
  return (
    logged.filter(isDispute).length +
    context.pendingEvidence.filter(
      (event) => event.conceptId === conceptId && isDispute(event),
    ).length
  );
}
