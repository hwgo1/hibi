export interface HelpCommand {
  command: string;
  description: string;
}

export interface HelpSection {
  title: string;
  commands: HelpCommand[];
}

/**
 * What `/help` shows. The short form leads with examples of what to type,
 * since someone new to programming is lost for a starting point, not for a
 * command list. The full form groups commands by intent rather than
 * alphabetically.
 */
export interface HelpContent {
  intro: string;
  examples: string[];
  essentials: HelpCommand[];
  more: string;
  sections: HelpSection[];
}

const HELP: Record<string, HelpContent> = {
  en: {
    intro: "Just talk, the way you would with a teacher. For example:",
    examples: [
      "I want to learn Go",
      "what is a variable?",
      "give me an exercise on lists",
      "I'm stuck, my code shows this error: …",
    ],
    essentials: [
      { command: "/undo", description: "take back the last answer" },
      { command: "/exit", description: "leave hibi" },
    ],
    more: "Type /help all to see every command.",
    sections: [
      {
        title: "Your progress",
        commands: [
          { command: "/profile", description: "what hibi knows about you" },
          { command: "/state", description: "what is open right now" },
          {
            command: "/signals",
            description: "what it has noticed about how you learn",
          },
        ],
      },
      {
        title: "Conversation",
        commands: [
          { command: "/undo", description: "take back the last answer" },
          {
            command: "/clear",
            description: "clear the conversation, keeping your progress",
          },
          {
            command: "/forget",
            description: "forget a topic: /forget <topic>",
          },
        ],
      },
      {
        title: "Settings",
        commands: [
          { command: "/prefs", description: "change how hibi teaches" },
          { command: "/model", description: "switch the AI model" },
          {
            command: "/provider",
            description: "switch between OpenAI and Anthropic",
          },
          { command: "/reset", description: "remove your access key" },
        ],
      },
      {
        title: "Other",
        commands: [
          { command: "/index", description: "re-read your project files" },
          { command: "/cost", description: "what this conversation has cost" },
          { command: "/stop", description: "shut down hibi in the background" },
          { command: "/exit", description: "leave hibi" },
        ],
      },
    ],
  },
  pt: {
    intro: "Converse normalmente, como faria com um professor. Por exemplo:",
    examples: [
      "quero aprender Go",
      "o que é uma variável?",
      "me dá um exercício sobre listas",
      "travei, meu código dá esse erro: …",
    ],
    essentials: [
      { command: "/undo", description: "desfaz a última resposta" },
      { command: "/exit", description: "sai do hibi" },
    ],
    more: "Digite /help all para ver todos os comandos.",
    sections: [
      {
        title: "Seu progresso",
        commands: [
          { command: "/profile", description: "o que o hibi sabe sobre você" },
          { command: "/state", description: "o que está aberto agora" },
          {
            command: "/signals",
            description: "o que ele percebeu sobre como você aprende",
          },
        ],
      },
      {
        title: "Conversa",
        commands: [
          { command: "/undo", description: "desfaz a última resposta" },
          {
            command: "/clear",
            description: "limpa a conversa, mas seu progresso fica",
          },
          {
            command: "/forget",
            description: "esquece um assunto: /forget <assunto>",
          },
        ],
      },
      {
        title: "Ajustes",
        commands: [
          { command: "/prefs", description: "muda como o hibi ensina" },
          { command: "/model", description: "troca o modelo de IA" },
          {
            command: "/provider",
            description: "troca entre OpenAI e Anthropic",
          },
          { command: "/reset", description: "apaga sua chave de acesso" },
        ],
      },
      {
        title: "Outros",
        commands: [
          { command: "/index", description: "relê os arquivos do seu projeto" },
          { command: "/cost", description: "quanto esta conversa custou" },
          { command: "/stop", description: "desliga o hibi em segundo plano" },
          { command: "/exit", description: "sai do hibi" },
        ],
      },
    ],
  },
  es: {
    intro:
      "Conversa con normalidad, como lo harías con un profesor. Por ejemplo:",
    examples: [
      "quiero aprender Go",
      "¿qué es una variable?",
      "dame un ejercicio sobre listas",
      "me trabé, mi código da este error: …",
    ],
    essentials: [
      { command: "/undo", description: "deshace la última respuesta" },
      { command: "/exit", description: "sale de hibi" },
    ],
    more: "Escribe /help all para ver todos los comandos.",
    sections: [
      {
        title: "Tu progreso",
        commands: [
          { command: "/profile", description: "lo que hibi sabe de ti" },
          { command: "/state", description: "lo que está abierto ahora" },
          {
            command: "/signals",
            description: "lo que notó sobre cómo aprendes",
          },
        ],
      },
      {
        title: "Conversación",
        commands: [
          { command: "/undo", description: "deshace la última respuesta" },
          {
            command: "/clear",
            description: "limpia la conversación, tu progreso se queda",
          },
          { command: "/forget", description: "olvida un tema: /forget <tema>" },
        ],
      },
      {
        title: "Ajustes",
        commands: [
          { command: "/prefs", description: "cambia cómo enseña hibi" },
          { command: "/model", description: "cambia el modelo de IA" },
          {
            command: "/provider",
            description: "cambia entre OpenAI y Anthropic",
          },
          { command: "/reset", description: "borra tu clave de acceso" },
        ],
      },
      {
        title: "Otros",
        commands: [
          {
            command: "/index",
            description: "vuelve a leer los archivos de tu proyecto",
          },
          {
            command: "/cost",
            description: "cuánto ha costado esta conversación",
          },
          { command: "/stop", description: "apaga hibi en segundo plano" },
          { command: "/exit", description: "sale de hibi" },
        ],
      },
    ],
  },
};

/** Help in the learner's language, by primary subtag, falling back to English. */
export function helpFor(language: string): HelpContent {
  const primary = language.toLowerCase().split("-")[0] ?? "en";
  return HELP[primary] ?? HELP["en"]!;
}
