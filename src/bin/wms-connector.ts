#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WmsConnectorStack } from '../cdk/wms-connector-stack';
import { WmsAlertsStack } from '../cdk/wms-alerts-stack';
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

  const stackProps: cdk.StackProps = {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
  };

  const alertsStack = new WmsAlertsStack(app, `wms-alerts-${stage}`, {
    ...stackProps,
    stage,
    alertEmails: fullConfig.alertEmails,
  });

  new WmsConnectorStack(app, `wms-connector-${stage}`, {
    ...stackProps,
    fullConfig,
    alertsTopicArn: alertsStack.alertsTopicArn,
  });

  app.synth();
}

main().catch((err) => {
  console.error('Error during CDK synthesis:', err);
  process.exit(1);
});
