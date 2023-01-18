export const enum EnvVariable {
  SscepPath = 'SSCEP_PATH',
  ScepUsername = 'SSCEP_USERNAME',
  ScepPassword = 'SSCEP_PASSWORD',
  ScepServerOtpUrl = 'SSCEP_SERVER_OTP_URL',
  ScepServerCertUrl = 'SSCEP_SERVER_CERT_URL',
  ScepCertLocalityName = 'SCEP_CERT_LOCALITY_NAME',
  ScepCertCountryName = 'SCEP_CERT_COUNTRY_NAME',
  ScepCertOrganizationalUnitName = 'SCEP_CERT_ORGANIZATIONAL_UNIT_NAME',
  OpensslPath = 'OPENSSL_PATH',
  AzureProvisioningIdScope = 'AZURE_PROVISIONING_ID_SCOPE',
  AzureProvisioningHost = 'AZURE_PROVISIOING_HOST',
  AzureIotHubConnectionString = 'AZURE_IOTHUB_CONNECTIONSTRING',
}

export const getEnv = (variable: EnvVariable, defaultValue?: string): string | undefined => process.env[variable] ?? defaultValue;
