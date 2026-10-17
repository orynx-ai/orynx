import { getCACertificates, setDefaultCACertificates } from 'node:tls';

/**
 * Trusts the certificates this computer trusts, as well as Node's bundled ones, for every call the
 * server makes (fetch included). A company TLS proxy signs with a root that lives only in the OS
 * store; without this, every call to Jira fails with UNABLE_TO_GET_ISSUER_CERT_LOCALLY. It does
 * what `node --use-system-ca` does, in dev and start alike, on every OS.
 */
export function trustSystemCertificates(): void {
  setDefaultCACertificates([...new Set([...getCACertificates('bundled'), ...getCACertificates('system')])]);
}
