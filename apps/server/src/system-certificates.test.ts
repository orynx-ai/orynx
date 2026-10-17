import { X509Certificate } from 'node:crypto';
import { getCACertificates } from 'node:tls';
import { describe, expect, it } from 'vitest';
import { trustSystemCertificates } from './system-certificates.ts';

/** Node writes the same certificate in more than one PEM layout, so compare fingerprints. */
const fingerprints = (pems: readonly string[]) => pems.map((pem) => new X509Certificate(pem).fingerprint256);

describe('trustSystemCertificates', () => {
  it("adds this computer's trusted certificates to Node's own, so a company TLS proxy works", () => {
    const wanted = fingerprints([...getCACertificates('bundled'), ...getCACertificates('system')]);

    trustSystemCertificates();

    expect(new Set(fingerprints(getCACertificates('default')))).toEqual(new Set(wanted));
  });

  it('can run twice without trusting anything twice', () => {
    trustSystemCertificates();
    const once = getCACertificates('default').length;

    trustSystemCertificates();

    expect(getCACertificates('default')).toHaveLength(once);
  });
});
