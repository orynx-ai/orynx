/** Reads the per-start session token the server put in the page. */
export function readDevhubToken(doc: Document = document): string {
  return doc.querySelector<HTMLMetaElement>('meta[name="devhub-token"]')?.content ?? '';
}
