/// <reference types="vite/client" />

declare module "nspell" {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    spell(word: string): { correct: boolean };
    add(word: string): void;
    remove(word: string): void;
  }

  interface NSpellConstructor {
    new (aff: string, dic: string): NSpell;
    (aff: string, dic: string): NSpell;
  }

  const NSpell: NSpellConstructor;
  export default NSpell;
}
