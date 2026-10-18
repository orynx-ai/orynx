import { useForm, useWatch } from 'react-hook-form';
import { Dialog, DialogContent, DialogTitle, SearchPalette } from '@devhub/ui';
import { useSearchStore } from '../store.ts';

const boxLabel = 'Search tickets, pull requests and sessions';

/**
 * ⌘K search (spec 009): a dialog over any page, opened by ⌘K or Ctrl+K and the sidebar's Search. It opens
 * empty every time: the body unmounts when the dialog closes, and the text with it.
 */
export function SearchDialog() {
  const open = useSearchStore((state) => state.open);
  const setOpen = useSearchStore((state) => state.setOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <SearchBody />
      </DialogContent>
    </Dialog>
  );
}

function SearchBody() {
  const form = useForm<{ query: string }>({ defaultValues: { query: '' } });
  const query = useWatch({ control: form.control, name: 'query' });
  return (
    <SearchPalette
      label={boxLabel}
      query={query}
      onQueryChange={(next) => {
        form.setValue('query', next);
      }}
      groups={[]}
      onPick={() => undefined}
    >
      <p className="px-2 py-1.5 text-small text-muted-foreground">
        Find a ticket by key or title, a pull request by number or repository, or a session.
      </p>
    </SearchPalette>
  );
}
