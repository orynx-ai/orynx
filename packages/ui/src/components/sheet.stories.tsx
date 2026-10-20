import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.tsx';
import { Checkbox } from './checkbox.tsx';
import { Sheet, SheetBody, SheetContent, SheetFoot, SheetRow, SheetTrigger } from './sheet.tsx';

const meta = {
  title: 'Components/Sheet',
  component: Sheet,
  // Open from the start, so the story shows the sheet; Esc closes it and the button opens it again.
  args: { defaultOpen: true },
  decorators: [
    (Story) => (
      <div className="min-h-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const statuses = ['To do', 'In progress', 'In review', 'Done'];

/** Tickets' filters (spec 039): groups of checkboxes, the count and Clear filters in the foot. */
export const Filters: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger asChild>
        <Button variant="secondary">Filters</Button>
      </SheetTrigger>
      <SheetContent title="Filters">
        <SheetBody>
          <fieldset className="m-0 flex flex-col border-0 p-0">
            <legend className="mb-2 text-small font-medium">Status</legend>
            {statuses.map((status) => (
              <Checkbox key={status} label={status} defaultChecked={status === 'In review'} className="min-h-10 py-2" />
            ))}
          </fieldset>
        </SheetBody>
        <SheetFoot>
          <span className="text-small text-muted-foreground">11 tickets</span>
          <Button variant="ghost" size="sm" className="ms-auto">
            Clear filters
          </Button>
        </SheetFoot>
      </SheetContent>
    </Sheet>
  ),
};

/** More than the window holds: only the body scrolls, and the head and foot stay. */
export const TallerThanTheWindow: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger asChild>
        <Button variant="secondary">Filters</Button>
      </SheetTrigger>
      <SheetContent title="Filters">
        <SheetBody className="gap-0">
          {Array.from({ length: 40 }, (_, index) => (
            <Checkbox key={index} label={`Person ${String(index + 1)}`} className="min-h-10 py-2" />
          ))}
        </SheetBody>
        <SheetFoot>
          <span className="text-small text-muted-foreground">11 tickets</span>
        </SheetFoot>
      </SheetContent>
    </Sheet>
  ),
};

/** Filters as the user drew it (spec 039): a row for each filter, its count and what it holds, leading to its page. */
export const Rows: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger asChild>
        <Button variant="secondary">Filters</Button>
      </SheetTrigger>
      <SheetContent title="Filters">
        <SheetBody className="gap-0 p-0">
          <SheetRow title="Project" summary="MAI" />
          <SheetRow title="Sprint" summary="MAI Sprint 20.0" />
          <SheetRow title="Assignee" count={1} summary="Me" />
          <SheetRow title="Status" count={2} summary="In review, Done" />
          <SheetRow title="Type" summary="Any" />
        </SheetBody>
        <SheetFoot>
          <span className="text-small text-muted-foreground">11 tickets</span>
        </SheetFoot>
      </SheetContent>
    </Sheet>
  ),
};

/** A filter's own page: Back before its title, then its options. */
export const Page: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger asChild>
        <Button variant="secondary">Filters</Button>
      </SheetTrigger>
      <SheetContent title="Status" back={{ label: 'Back to filters', onBack: () => undefined }}>
        <SheetBody className="gap-0">
          {statuses.map((status) => (
            <Checkbox key={status} label={status} defaultChecked={status === 'In review'} className="min-h-10 py-2" />
          ))}
        </SheetBody>
      </SheetContent>
    </Sheet>
  ),
};
