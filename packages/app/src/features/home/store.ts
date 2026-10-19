import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ComposerChip, EffortLevel, SessionMode } from '@devhub/contracts';
import { addChip, sameChip, type AddChip } from './composer-rules.ts';

/**
 * Home's composer draft (spec 015, Q14): what you typed, the chips in the order you added them, and the folder you
 * picked yourself. It stays while Orynx is open, so leaving Home keeps it, and goes with a reload or a sent task.
 * The folder the last task started in, and the model and effort you picked, are kept on this computer as
 * preferences (Q7).
 */
interface ComposerState {
  text: string;
  chips: ComposerChip[];
  /** The folder you picked; null leaves the choice to Q7's rules. */
  picked: string | null;
  lastUsed: string | null;
  /** The model you picked in the agent picker; null is Claude Code's own default. */
  model: string | null;
  /** Ask or Build, once you've picked (spec 026); null follows the chips: Build with a ticket, else Ask. */
  mode: SessionMode | null;
  /** The effort you picked for that model; null is the model's own default. */
  effort: EffortLevel | null;
  setText: (text: string) => void;
  /** Adds a chip after the others, or says why not (spec 022, Q2, Q5). */
  addChip: (chip: ComposerChip) => Extract<AddChip, { ok: false }>['refusal'] | null;
  removeChip: (index: number) => void;
  /** Takes this chip out, wherever it is: a row's + pressed again (spec 022, AC-29). */
  dropChip: (chip: ComposerChip) => void;
  pickFolder: (id: string) => void;
  setModel: (model: string | null) => void;
  setMode: (mode: SessionMode) => void;
  setEffort: (effort: EffortLevel | null) => void;
  /** A task started, in this folder if the page named one: the draft goes, and the folder is remembered. */
  sent: (folderId: string | null) => void;
}

export const initialComposer: Pick<
  ComposerState,
  'text' | 'chips' | 'picked' | 'lastUsed' | 'model' | 'effort' | 'mode'
> = {
  text: '',
  chips: [],
  picked: null,
  lastUsed: null,
  model: null,
  mode: null,
  effort: null,
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
      setMode: (mode) => {
        set({ mode });
      },
      setModel: (model) => {
        set({ model });
      },
      setEffort: (effort) => {
        set({ effort });
      },
      sent: (folderId) => {
        set((state) => ({ text: '', chips: [], picked: null, mode: null, lastUsed: folderId ?? state.lastUsed }));
      },
    }),
    {
      name: 'devhub.home',
      partialize: (state) => ({ lastUsed: state.lastUsed, model: state.model, effort: state.effort }),
    },
  ),
);
