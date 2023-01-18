import { z } from 'zod';

export const CsrConfigOptionsSchema = z.object({
  countryName: z.string(),
  localityName: z.string(),
  organizationalUnitName: z.string(),
  passcode: z.string().optional(),
});

export type CsrConfigOptions = z.infer<typeof CsrConfigOptionsSchema>;

/**
 * Generate a csr request config file
 * @param deviceId
 * @param options
 */
export const generateConfig = (deviceId: string, options: CsrConfigOptions) => `
#
# Configuration file for use with sscep
#

[ req ]
prompt = no
keyUsage = keyEncipherment,dataEncipherment
extendedKeyUsage = serverAuth,clientAuth
distinguished_name = req_distinguished_name
attributes = req_attributes
utf8 = no
string_mask = nombstr

[ req_distinguished_name ]
countryName = ${ options.countryName }
localityName = ${ options.localityName }
organizationalUnitName = ${ options.organizationalUnitName }
commonName = ${ deviceId }

${ options.passcode ? passcodePart(options.passcode) : '' }`;

const passcodePart = (passcode: string) => `
[ req_attributes ]
challengePassword = ${ passcode }
`;
