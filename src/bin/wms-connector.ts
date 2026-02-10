#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WmsConnectorStack } from '../cdk/wms-connector-stack';
import { getFullEnvironmentConfig } from '../environment-config';

async function main() {
  const app = new cdk.App();
  const stage = app.node.tryGetContext('stage') as string | undefined;

  if (!stage) {
    throw new Error(
      'Stage is required. Use -c stage=main|val|production|<branch-name>\n' +
        'Example: cdk synth -c stage=main'
    );
  }

  const fullConfig = await getFullEnvironmentConfig(stage);

  new WmsConnectorStack(app, `wms-connector-${stage}`, {
    fullConfig,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
  });

  app.synth();
}

main().catch((err) => {
  console.error('Error during CDK synthesis:', err);
  process.exit(1);
});
