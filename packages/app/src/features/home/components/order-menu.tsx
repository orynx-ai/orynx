import { Menu, MenuContent, MenuRadioGroup, MenuRadioItem, MenuTrigger, Picker } from '@devhub/ui';
import type { HomeView } from '../inbox-view.ts';

const orderLabels: Record<HomeView['order'], string> = { newest: 'Newest first', longest: 'Longest wait first' };

/** The list's order, in the panel's head where the design wrote "Sorted by how long it has waited" (Q10d). */
export function OrderMenu({
  order,
  onOrderChange,
}: {
  order: HomeView['order'];
  onOrderChange: (order: HomeView['order']) => void;
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Picker aria-label={`Order: ${orderLabels[order]}`}>{orderLabels[order]}</Picker>
      </MenuTrigger>
      <MenuContent aria-label="Order">
        <MenuRadioGroup
          value={order}
          onValueChange={(value) => {
            onOrderChange(value === 'longest' ? 'longest' : 'newest');
          }}
        >
          <MenuRadioItem value="newest">{orderLabels.newest}</MenuRadioItem>
          <MenuRadioItem value="longest">{orderLabels.longest}</MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
