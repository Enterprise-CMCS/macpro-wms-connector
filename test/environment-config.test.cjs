const assert = require('node:assert/strict');
const test = require('node:test');
const AWS = require('aws-sdk');

const baseSecrets = {
  'mmdl/val/vpc': JSON.stringify({
    id: 'vpc-1234567890abcdef0',
    dataSubnets: ['subnet-data-a'],
    privateSubnets: ['subnet-private-a'],
    publicSubnets: ['subnet-public-a'],
  }),
  'mmdl/val/brokerString': 'broker.example.internal:9094',
  'mmdl/val/dbInfo': JSON.stringify({
    ip: '10.0.0.10',
    port: '1521',
    db: 'WMS',
    user: 'cdc_user',
    password: 'secret',
    schema: 'WMS',
  }),
  'mmdl/val/iam/path': '/delegatedadmin/developer/',
  'mmdl/val/iam/permissionsBoundary':
    'arn:aws:iam::123456789012:policy/delegatedadmin/developer/boundary',
  'crowdstrike/falcon': JSON.stringify({
    cid: ' cid-placeholder ',
    provisioningToken: ' token-placeholder ',
    image: ' example.invalid/falcon-container:test ',
  }),
};

function installSecretMap(secretMap) {
  AWS.SecretsManager.prototype.getSecretValue = ({ SecretId }) => ({
    promise: async () => {
      if (Object.prototype.hasOwnProperty.call(secretMap, SecretId)) {
        return { SecretString: secretMap[SecretId] };
      }
      const error = new Error(`Secret ${SecretId} was not found`);
      error.code = 'ResourceNotFoundException';
      throw error;
    },
  });
}

test('loads required config when optional alert and TLS secrets are missing', async () => {
  installSecretMap(baseSecrets);
  const { loadEnvironmentSecrets } = require('../lib/environment-config');

  const config = await loadEnvironmentSecrets('val');

  assert.deepEqual(config.alertEmails, []);
  assert.equal(config.connectAlbTls, undefined);
  assert.deepEqual(config.falcon, {
    cid: 'cid-placeholder',
    provisioningToken: 'token-placeholder',
    image: 'example.invalid/falcon-container:test',
  });
});

test('loads optional alert and TLS config when configured for a stage', async () => {
  installSecretMap({
    ...baseSecrets,
    'mmdl/val/alertEmails': JSON.stringify({ emails: ['ops@example.com', 'ops@example.com'] }),
    'mmdl/val/connectAlbTls': JSON.stringify({
      certificateAuthorityArn:
        'arn:aws:acm-pca:us-east-1:123456789012:certificate-authority/00000000-0000-4000-8000-000000000000',
      certificateAuthorityPem: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
    }),
  });
  const { loadEnvironmentSecrets } = require('../lib/environment-config');

  const config = await loadEnvironmentSecrets('val');

  assert.deepEqual(config.alertEmails, ['ops@example.com']);
  assert.deepEqual(config.connectAlbTls, {
    certificateAuthorityArn:
      'arn:aws:acm-pca:us-east-1:123456789012:certificate-authority/00000000-0000-4000-8000-000000000000',
    certificateAuthorityPem: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
  });
});

test('rejects a missing or incomplete crowdstrike/falcon secret', async () => {
  const { loadEnvironmentSecrets } = require('../lib/environment-config');
  const { 'crowdstrike/falcon': _falcon, ...withoutFalcon } = baseSecrets;

  installSecretMap(withoutFalcon);
  await assert.rejects(() => loadEnvironmentSecrets('val'), /crowdstrike\/falcon/);

  installSecretMap({
    ...baseSecrets,
    'crowdstrike/falcon': JSON.stringify({ cid: 'cid-placeholder', image: 'example.invalid/falcon:test' }),
  });
  await assert.rejects(() => loadEnvironmentSecrets('val'), /provisioningToken/);

  installSecretMap({
    ...baseSecrets,
    'crowdstrike/falcon': 'not-json',
  });
  await assert.rejects(() => loadEnvironmentSecrets('val'), /valid JSON/);
});
