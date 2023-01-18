import x509 from 'x509.js';

export class CertificateExpiredError extends Error {
  constructor() {
    super('Certificate expired');
  }
}

export const validateCertificate = (cert: string): void => {
  const certificate = x509.parseCert(cert);

  if (certificate.notAfter < new Date()) {
    throw new CertificateExpiredError();
  }
};
