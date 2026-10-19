import { createContext, useContext } from 'react';
import type { ComposerChip } from '@devhub/contracts';
import type { ChipRefusal } from './composer-rules.ts';
import { useComposerStore } from './store.ts';

/** The chips a composer holds and how they change: Home's draft, or a session's follow-up (spec 025). */
export interface ComposerChips {
  chips: readonly ComposerChip[];
  /** Adds a chip after the others, or says why not (spec 022, Q2, Q5). */
  addChip: (chip: ComposerChip) => ChipRefusal | null;
  removeChip: (index: number) => void;
  /** Takes this chip out, wherever it is. */
  dropChip: (chip: ComposerChip) => void;
}

const ChipsContext = createContext<ComposerChips | null>(null);

/** Gives + Add context, the strip and the context dialog inside it another composer's chips than Home's. */
export const ComposerChipsProvider = ChipsContext;

/** The chips of the composer around it: a follow-up's when one provides them, else Home's draft. */
export function useComposerChips(): ComposerChips {
  const given = useContext(ChipsContext);
  const chips = useComposerStore((state) => state.chips);
  const addChip = useComposerStore((state) => state.addChip);
  const removeChip = useComposerStore((state) => state.removeChip);
  const dropChip = useComposerStore((state) => state.dropChip);
  return given ?? { chips, addChip, removeChip, dropChip };
}
