/** What the window does with an address: stay in Orynx, hand it to the OS, or refuse it. */
export type LinkAction = 'allow' | 'external' | 'deny';

function parse(url: string): URL | null {
  return URL.canParse(url) ? new URL(url) : null;
}

/**
 * A new window the page asks for (`window.open`, `target="_blank"`): the web Platform's openExternal, for
 * Jira, GitHub and Slack links (spec 027, AC-13). Only https goes to the default browser.
 */
export function newWindowAction(url: string): Exclude<LinkAction, 'allow'> {
  return parse(url)?.protocol === 'https:' ? 'external' : 'deny';
}

/**
 * The Orynx window itself moving to an address. It stays on the hub's own page; Open in's `vscode:` and
 * `cursor:` links go to the editor (AC-14); everything else is refused (AC-15).
 */
export function navigationAction(url: string, hubOrigin: string): LinkAction {
  const target = parse(url);
  if (target === null) return 'deny';
  if (target.origin === hubOrigin) return 'allow';
  return target.protocol === 'vscode:' || target.protocol === 'cursor:' ? 'external' : 'deny';
}
