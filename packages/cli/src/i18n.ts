type StringKey =
  | "opening"
  | "notIndexed"
  | "repoLabel"
  | "starting"
  | "noProfile"
  | "changeWith"
  | "restartNeeded"
  | "confirmReset"
  | "forgetWarning"
  | "typeForget";

type Catalog = Record<StringKey, string>;

/**
 * Fixed CLI strings, by language. Keys are matched by primary subtag, so "pt-BR"
 * and "pt-PT" share an entry. English is the fallback for any language with no catalog.
 */
const CATALOGS: Record<string, Catalog> = {
  en: {
    opening:
      "Want an exercise, or would you rather I look at something you already wrote?",
    notIndexed:
      "not indexed yet — I can still read your files, just slower to orient",
    repoLabel: "repo",
    starting: "starting daemon…",
    noProfile: "no profile yet",
    changeWith: "change with: /prefs <key> <value>",
    restartNeeded: "saved — restart hibi for it to take effect",
    confirmReset: "remove stored credentials?",
    forgetWarning:
      "this permanently deletes your entire learning history and cannot be undone",
    typeForget: "type 'forget' to confirm:",
  },
  pt: {
    opening:
      "Quer um exercício, ou prefere que eu olhe algo que você já escreveu?",
    notIndexed:
      "ainda não indexado — consigo ler seus arquivos, só demoro mais pra me situar",
    repoLabel: "repo",
    starting: "iniciando daemon…",
    noProfile: "nenhum perfil ainda",
    changeWith: "mude com: /prefs <chave> <valor>",
    restartNeeded: "salvo — reinicie o hibi para valer",
    confirmReset: "remover as credenciais salvas?",
    forgetWarning:
      "isso apaga todo o seu histórico de aprendizado e não tem volta",
    typeForget: "digite 'forget' para confirmar:",
  },
  es: {
    opening:
      "¿Quieres un ejercicio, o prefieres que mire algo que ya escribiste?",
    notIndexed:
      "aún sin indexar — puedo leer tus archivos, solo tardo más en orientarme",
    repoLabel: "repo",
    starting: "iniciando daemon…",
    noProfile: "aún no hay perfil",
    changeWith: "cambia con: /prefs <clave> <valor>",
    restartNeeded: "guardado — reinicia hibi para aplicarlo",
    confirmReset: "¿eliminar las credenciales guardadas?",
    forgetWarning:
      "esto borra todo tu historial de aprendizaje y no se puede deshacer",
    typeForget: "escribe 'forget' para confirmar:",
  },
};

const FALLBACK = CATALOGS["en"]!;

/** Resolves a catalog from a BCP-47 tag, falling back to English */
export function catalogFor(language: string): Catalog {
  const primary = language.toLowerCase().split("-")[0] ?? "en";
  return CATALOGS[primary] ?? FALLBACK;
}

export type { Catalog, StringKey };
