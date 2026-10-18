import { create } from 'zustand';

/**
 * Follow-ups you've typed and not sent, by session (spec 013, AC-19): kept while you look at other pages, gone
 * when the browser tab closes. Never saved: a draft that came back after a restart would surprise (client-state).
 */
interface SessionDraftsState {
  drafts: Record<string, string>;
  setDraft: (sessionId: string, text: string) => void;
  clearDraft: (sessionId: string) => void;
}

export const initialDrafts: Pick<SessionDraftsState, 'drafts'> = { drafts: {} };

export const useSessionDrafts = create<SessionDraftsState>()((set) => ({
  ...initialDrafts,
  setDraft: (sessionId, text) => {
    set((state) => ({ drafts: { ...state.drafts, [sessionId]: text } }));
  },
  clearDraft: (sessionId) => {
    set((state) => ({ drafts: Object.fromEntries(Object.entries(state.drafts).filter(([id]) => id !== sessionId)) }));
  },
}));
