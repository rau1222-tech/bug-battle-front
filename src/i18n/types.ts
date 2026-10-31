export type Language = 'es' | 'en' | 'fr';

export type Dictionary = Record<string, string>;

/** One namespace's strings in every supported language. Spanish is the reference. */
export type NamespaceMessages = Record<Language, Dictionary>;

export type TranslateParams = Record<string, string | number>;
