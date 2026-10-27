import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ComposerChip, ComposerStart, EffortLevel, SessionMode, StartSessionAnswer } from '@devhub/contracts';
import { addChip, sameChip, type AddChip } from './composer-rules.ts';

/**
 * The last start that opened nothing, from Send or a row's Fix (spec 047), for what's said under the box: what was
 * sent, the answer (`failed` when the server couldn't be asked), and whether it was the draft, which goes once it starts.
 */
export interface StartTried {
  request: ComposerStart;
  answer: Exclude<StartSessionAnswer, { result: 'started' }> | 'failed';
  draft: boolean;
}

/**
 * Home's composer draft (spec 015, Q14): what you typed, the chips in the order you added them, and the folder you
 * picked yourself. It stays while Orynx is open, so leaving Home keeps it, and goes with a reload or a sent task.
 * The folder the last task started in, the model and effort you picked, and Ask or Build (spec 031, Q1) are kept on
 * this computer as preferences (Q7).
 */
interface ComposerState {
  text: string;
  chips: ComposerChip[];
  /** The folder you picked; null leaves the choice to Q7's rules. */
  picked: string | null;
  lastUsed: string | null;
  /** The model you picked in the agent picker; null is Claude Code's own default. */
  model: string | null;
  /** The effort you picked for that model; null is the model's own default. */
  effort: EffortLevel | null;
  /** Ask or Build, as you last picked it; Build the first time (spec 031, Q1). */
  mode: SessionMode;
  tried: StartTried | null;
  setText: (text: string) => void;
  /** Adds a chip after the others, or says why not (spec 022, Q2, Q5). */
  addChip: (chip: ComposerChip) => Extract<AddChip, { ok: false }>['refusal'] | null;
  removeChip: (index: number) => void;
  /** Takes this chip out, wherever it is: a row's + pressed again (spec 022, AC-29). */
  dropChip: (chip: ComposerChip) => void;
  /** A folder by its id, or none: an Ask's No folder (spec 031). */
  pickFolder: (id: string | null) => void;
  setModel: (model: string | null) => void;
  setEffort: (effort: EffortLevel | null) => void;
  setMode: (mode: SessionMode) => void;
  setTried: (tried: StartTried | null) => void;
  /** A task started, in this folder if the page named one: the draft goes, and the folder is remembered. */
  sent: (folderId: string | null) => void;
}

export const initialComposer: Pick<
  ComposerState,
  'text' | 'chips' | 'picked' | 'lastUsed' | 'model' | 'effort' | 'mode' | 'tried'
> = {
  text: '',
  chips: [],
  picked: null,
  lastUsed: null,
  model: null,
  effort: null,
  mode: 'build',
  tried: null,
};

export const useComposerStore = create<ComposerState>()(
  persist(
    (set, get) => ({
      ...initialComposer,
      setText: (text) => {
        set({ text });
      },
      addChip: (chip) => {
        const added = addChip(get().chips, chip);
        if (!added.ok) return added.refusal;
        set({ chips: added.chips });
        return null;
      },
      removeChip: (index) => {
        set((state) => ({ chips: state.chips.filter((_, at) => at !== index) }));
      },
      dropChip: (chip) => {
        set((state) => ({ chips: state.chips.filter((held) => !sameChip(held, chip)) }));
      },
      pickFolder: (id) => {
        set({ picked: id });
      },
      setModel: (model) => {
        set({ model });
      },
      setEffort: (effort) => {
        set({ effort });
      },
      setMode: (mode) => {
        set({ mode });
      },
      setTried: (tried) => {
        set({ tried });
      },
      sent: (folderId) => {
        set((state) => ({ text: '', chips: [], picked: null, tried: null, lastUsed: folderId ?? state.lastUsed }));
      },
    }),
    {
      name: 'devhub.home',
      partialize: (state) => ({ lastUsed: state.lastUsed, model: state.model, effort: state.effort, mode: state.mode }),
    },
  ),
);
