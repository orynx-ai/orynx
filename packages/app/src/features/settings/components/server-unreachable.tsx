import { Callout } from '@devhub/ui';

/** What a Settings tab shows in place of its content when the server doesn't answer. */
export function ServerUnreachable() {
  return (
    <Callout tone="warning" role="alert" title="Could not reach the Orynx server">
      <span>Check that Orynx is still running in your terminal, then reload the page.</span>
    </Callout>
  );
}
