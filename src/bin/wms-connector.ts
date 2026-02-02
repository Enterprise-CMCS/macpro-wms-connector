#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WmsConnectorStack } from '../cdk/wms-connector-stack';

const app = new cdk.App();
const stage = app.node.tryGetContext('stage') as string | undefined;

if (!stage) {
  throw new Error(
    'Stage is required. Use -c stage=main|val|production|<branch-name>\n' +
    'Example: cdk synth -c stage=main'
  );
}

new WmsConnectorStack(app, `wms-connector-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
