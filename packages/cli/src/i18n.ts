type StringKey =
  | "greeting"
  | "greetingNamed"
  | "resuming"
  | "hint"
  | "weakModel"
  | "starting"
  | "thinking"
  | "hintOf"
  | "unknownCommand"
  | "noProfile"
  | "changeWith"
  | "restartNeeded"
  | "forgetWarning"
  | "onboardIntro"
  | "onboardIntroDetail"
  | "stepLanguage"
  | "languageConfirm"
  | "stepName"
  | "namePrompt"
  | "stepKey"
  | "keyExplain"
  | "providerPrompt"
  | "choosePrompt"
  | "keyWhere"
  | "keyPrompt"
  | "keyRequired"
  | "keyChecking"
  | "keyOk"
  | "keyInvalid"
  | "keyFailed"
  | "keySaved"
  | "ready";

type Catalog = Record<StringKey, string>;

/**
 * Every fixed string the CLI shows, by language. Written for someone who may
 * never have programmed: no jargon without a plain explanation next to it.
 *
 * Placeholders in braces are filled with `fill`. Command names stay in English
 * in every language, since they are typed rather than read.
 */
const CATALOGS: Record<string, Catalog> = {
  en: {
    greeting: "Hi! What do you want to learn today?",
    greetingNamed: "Hi, {name}. What do you want to learn today?",
    resuming: "Last time you were working on: {goal}.",
    hint: "Write however you like, ask for an exercise, or type /help.",
    weakModel:
      "The {model} model sometimes hands over the full answer. To learn better, use the recommended one: /model",
    starting: "starting…",
    thinking: "thinking",
    hintOf: "hint {step} of 3",
    unknownCommand:
      "I don't know that command. Type /help to see the ones that exist.",
    noProfile: "There's no profile yet.",
    changeWith: "To change one: /prefs <name> <value>",
    restartNeeded: "Saved. Close and reopen hibi for it to take effect.",
    forgetWarning:
      "This permanently deletes your whole learning history.\nTo confirm, type: /forget all forget",
    onboardIntro: "Hi! I'm hibi, a programming tutor.",
    onboardIntroDetail:
      "I help you actually learn: I explain, suggest exercises and give hints,\nwithout handing over the answer. Before we start, I need a few things.",
    stepLanguage: "Language",
    languageConfirm:
      "I'll speak {language}. Press Enter to confirm, or type another (pt, es):",
    stepName: "Name",
    namePrompt: "What should I call you? (Enter to skip)",
    stepKey: "Access key",
    keyExplain:
      "hibi runs on another company's artificial intelligence, which charges per use —\nusually a few cents per question. You create a key on their site and paste it\nhere; the cost goes straight to your account.",
    providerPrompt: "Which company do you want to use?",
    choosePrompt: "Choose [1]:",
    keyWhere: "Create your key at: {url}",
    keyPrompt: "Paste the key here:",
    keyRequired: "I need the key to continue.",
    keyChecking: "Testing the key…",
    keyOk: "it works!",
    keyInvalid: "the key was refused. Check that you copied all of it.",
    keyFailed: "it didn't work ({reason}).",
    keySaved: "It's stored only on your computer.",
    ready: "All set.",
  },
  pt: {
    greeting: "Oi! O que você quer aprender hoje?",
    greetingNamed: "Oi, {name}. O que você quer aprender hoje?",
    resuming: "Da última vez você estava em: {goal}.",
    hint: "Escreva do seu jeito, peça um exercício, ou digite /help.",
    weakModel:
      "O modelo {model} às vezes entrega a resposta pronta. Para aprender melhor, use o recomendado: /model",
    starting: "iniciando…",
    thinking: "pensando",
    hintOf: "dica {step} de 3",
    unknownCommand:
      "Não conheço esse comando. Digite /help para ver os que existem.",
    noProfile: "Ainda não há perfil.",
    changeWith: "Para mudar: /prefs <nome> <valor>",
    restartNeeded: "Salvo. Feche e abra o hibi de novo para valer.",
    forgetWarning:
      "Isso apaga todo o seu histórico de aprendizado, sem volta.\nPara confirmar, digite: /forget all forget",
    onboardIntro: "Oi! Eu sou o hibi, um tutor de programação.",
    onboardIntroDetail:
      "Eu te ajudo a aprender de verdade: explico, proponho exercícios e dou dicas,\nsem entregar a resposta pronta. Antes de começar, preciso de algumas coisas.",
    stepLanguage: "Idioma",
    languageConfirm:
      "Vou falar em {language}. Enter para confirmar, ou digite outro (en, es):",
    stepName: "Nome",
    namePrompt: "Como posso te chamar? (Enter para pular)",
    stepKey: "Chave de acesso",
    keyExplain:
      "O hibi funciona com a inteligência artificial de outra empresa, que cobra por uso —\nnormalmente alguns centavos por pergunta. Você cria uma chave no site dela e\ncola aqui; o custo vai direto para a sua conta.",
    providerPrompt: "Qual empresa você quer usar?",
    choosePrompt: "Escolha [1]:",
    keyWhere: "Crie sua chave em: {url}",
    keyPrompt: "Cole a chave aqui:",
    keyRequired: "Preciso da chave para continuar.",
    keyChecking: "Testando a chave…",
    keyOk: "funcionou!",
    keyInvalid: "a chave foi recusada. Confira se você copiou ela inteira.",
    keyFailed: "não funcionou ({reason}).",
    keySaved: "Ela fica guardada só no seu computador.",
    ready: "Tudo pronto.",
  },
  es: {
    greeting: "¡Hola! ¿Qué quieres aprender hoy?",
    greetingNamed: "Hola, {name}. ¿Qué quieres aprender hoy?",
    resuming: "La última vez estabas en: {goal}.",
    hint: "Escribe como quieras, pide un ejercicio, o escribe /help.",
    weakModel:
      "El modelo {model} a veces entrega la respuesta completa. Para aprender mejor, usa el recomendado: /model",
    starting: "iniciando…",
    thinking: "pensando",
    hintOf: "pista {step} de 3",
    unknownCommand:
      "No conozco ese comando. Escribe /help para ver los que existen.",
    noProfile: "Todavía no hay perfil.",
    changeWith: "Para cambiarlo: /prefs <nombre> <valor>",
    restartNeeded: "Guardado. Cierra y vuelve a abrir hibi para aplicarlo.",
    forgetWarning:
      "Esto borra todo tu historial de aprendizaje, sin vuelta atrás.\nPara confirmar, escribe: /forget all forget",
    onboardIntro: "¡Hola! Soy hibi, un tutor de programación.",
    onboardIntroDetail:
      "Te ayudo a aprender de verdad: explico, propongo ejercicios y doy pistas,\nsin entregar la respuesta. Antes de empezar, necesito algunas cosas.",
    stepLanguage: "Idioma",
    languageConfirm:
      "Voy a hablar en {language}. Enter para confirmar, o escribe otro (en, pt):",
    stepName: "Nombre",
    namePrompt: "¿Cómo te llamo? (Enter para saltar)",
    stepKey: "Clave de acceso",
    keyExplain:
      "hibi funciona con la inteligencia artificial de otra empresa, que cobra por uso —\nnormalmente unos céntimos por pregunta. Creas una clave en su sitio y la pegas\naquí; el costo va directo a tu cuenta.",
    providerPrompt: "¿Qué empresa quieres usar?",
    choosePrompt: "Elige [1]:",
    keyWhere: "Crea tu clave en: {url}",
    keyPrompt: "Pega la clave aquí:",
    keyRequired: "Necesito la clave para continuar.",
    keyChecking: "Probando la clave…",
    keyOk: "¡funciona!",
    keyInvalid: "la clave fue rechazada. Revisa que la copiaste completa.",
    keyFailed: "no funcionó ({reason}).",
    keySaved: "Queda guardada solo en tu computadora.",
    ready: "Todo listo.",
  },
};

const FALLBACK = CATALOGS["en"]!;
const PLACEHOLDER = /\{(\w+)\}/g;

/** Resolves a catalog from a BCP-47 tag by primary subtag, falling back to English. */
export function catalogFor(language: string): Catalog {
  const primary = language.toLowerCase().split("-")[0] ?? "en";
  return CATALOGS[primary] ?? FALLBACK;
}

/** Replaces `{name}` placeholders. Unknown placeholders are left as written. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(
    PLACEHOLDER,
    (match, key: string) => values[key] ?? match,
  );
}

export type { Catalog, StringKey };
