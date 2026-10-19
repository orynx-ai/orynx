import { create } from 'zustand';
import type { ComposerChip, DraftedPullRequest } from '@devhub/contracts';
import { addChip, sameChip, type ChipRefusal } from '../home/composer-rules.ts';

/**
 * Follow-ups you've typed and not sent, by session (spec 013, AC-19), with the chips added to each (spec 025): kept
 * while you look at other pages, gone when the browser tab closes. Never saved: a draft that came back after a
 * restart would surprise (client-state).
 */
interface SessionDraftsState {
  drafts: Record<string, string>;
  chips: Record<string, ComposerChip[]>;
  setDraft: (sessionId: string, text: string) => void;
  /** The text and the chips go, once the follow-up is sent. */
  clearDraft: (sessionId: string) => void;
  addChip: (sessionId: string, chip: ComposerChip) => ChipRefusal | null;
  removeChip: (sessionId: string, index: number) => void;
  dropChip: (sessionId: string, chip: ComposerChip) => void;
}

export const initialDrafts: Pick<SessionDraftsState, 'drafts' | 'chips'> = { drafts: {}, chips: {} };

function without<T>(record: Record<string, T>, sessionId: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([id]) => id !== sessionId));
}

export const useSessionDrafts = create<SessionDraftsState>()((set, get) => ({
  ...initialDrafts,
  setDraft: (sessionId, text) => {
    set((state) => ({ drafts: { ...state.drafts, [sessionId]: text } }));
  },
  clearDraft: (sessionId) => {
    set((state) => ({ drafts: without(state.drafts, sessionId), chips: without(state.chips, sessionId) }));
  },
  addChip: (sessionId, chip) => {
    const added = addChip(get().chips[sessionId] ?? [], chip);
    if (!added.ok) return added.refusal;
    set((state) => ({ chips: { ...state.chips, [sessionId]: added.chips } }));
    return null;
  },
  removeChip: (sessionId, index) => {
    set((state) => ({
      chips: { ...state.chips, [sessionId]: (state.chips[sessionId] ?? []).filter((_, at) => at !== index) },
    }));
  },
  dropChip: (sessionId, chip) => {
    set((state) => ({
      chips: { ...state.chips, [sessionId]: (state.chips[sessionId] ?? []).filter((held) => !sameChip(held, chip)) },
    }));
  },
}));

/**
 * The pull request dialog's draft, by session (spec 014, Q10h): Claude's draft with what you've changed in it, kept
 * while the page is open so opening the dialog again doesn't ask Claude again. `run` says which of Claude's runs it
 * was drafted after: once Claude has worked again, the next opening drafts afresh. Never saved (client-state).
 */
export interface KeptPullRequestDraft {
  run: string;
  draft: DraftedPullRequest;
  title: string;
  body: string;
}

interface PullRequestDraftsState {
  drafts: Record<string, KeptPullRequestDraft>;
  keep: (sessionId: string, kept: KeptPullRequestDraft) => void;
  edit: (sessionId: string, values: { title?: string; body?: string }) => void;
  forget: (sessionId: string) => void;
}

export const initialPullRequestDrafts: Pick<PullRequestDraftsState, 'drafts'> = { drafts: {} };

export const usePullRequestDrafts = create<PullRequestDraftsState>()((set) => ({
  ...initialPullRequestDrafts,
  keep: (sessionId, kept) => {
    set((state) => ({ drafts: { ...state.drafts, [sessionId]: kept } }));
  },
  edit: (sessionId, values) => {
    set((state) => {
      const kept = state.drafts[sessionId];
      return kept === undefined ? state : { drafts: { ...state.drafts, [sessionId]: { ...kept, ...values } } };
    });
  },
  forget: (sessionId) => {
    set((state) => ({ drafts: Object.fromEntries(Object.entries(state.drafts).filter(([id]) => id !== sessionId)) }));
  },
}));
