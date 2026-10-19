import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ComposerChip } from '@devhub/contracts';
import { addChip, type AddChip } from './composer-rules.ts';

/**
 * Home's composer draft (spec 015, Q14): what you typed, the chips in the order you added them, and the folder you
 * picked yourself. It stays while Orynx is open, so leaving Home keeps it, and goes with a reload or a sent task.
 * Only the folder the last task started in is kept on this computer, as a preference (Q7).
 */
interface ComposerState {
  text: string;
  chips: ComposerChip[];
  /** The folder you picked; null leaves the choice to Q7's rules. */
  picked: string | null;
  lastUsed: string | null;
  setText: (text: string) => void;
  /** Adds a chip after the others, or says why not (spec 022, Q2, Q5). */
  addChip: (chip: ComposerChip) => Extract<AddChip, { ok: false }>['refusal'] | null;
  removeChip: (index: number) => void;
  pickFolder: (id: string) => void;
  /** A task started, in this folder if the page named one: the draft goes, and the folder is remembered. */
  sent: (folderId: string | null) => void;
}

export const initialComposer: Pick<ComposerState, 'text' | 'chips' | 'picked' | 'lastUsed'> = {
  text: '',
  chips: [],
  picked: null,
  lastUsed: null,
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
      pickFolder: (id) => {
        set({ picked: id });
      },
      sent: (folderId) => {
        set((state) => ({ text: '', chips: [], picked: null, lastUsed: folderId ?? state.lastUsed }));
      },
    }),
    { name: 'devhub.home', partialize: (state) => ({ lastUsed: state.lastUsed }) },
  ),
);
