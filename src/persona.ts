/** What a cursor is like: how fast it works, what it is best at, how readily it helps a colleague. */
export type PersonaKind = 'rect' | 'text' | 'media' | 'line';

export interface Persona {
  /** Overall speed of this cursor, 0.8 (unhurried) to 1.3 (quick). */
  pace: number;
  /** The kind of work it is fastest at. */
  likes: PersonaKind;
  /** 0..1: how likely it is to step in when a busy colleague could use a hand. */
  helpful: number;
  /** Milliseconds it pauses before starting a task (at 1x speed). */
  think: number;
}

const KINDS: PersonaKind[] = ['text', 'rect', 'media', 'line'];

/** Cursor `i` gets a personality from the swarm's random source (same seed, same personalities). */
export function makePersona(rand: () => number, i: number): Persona {
  return {
    pace: 0.8 + rand() * 0.5,
    likes: KINDS[i % KINDS.length],
    helpful: 0.35 + rand() * 0.65,
    think: rand() * 200,
  };
}

/** Speed factor for one task: a cursor is a bit quicker at what it likes. */
export const paceFor = (p: Persona, kind: PersonaKind): number => p.pace * (p.likes === kind ? 1.3 : 1);
