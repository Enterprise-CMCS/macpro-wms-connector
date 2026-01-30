#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WmsConnectorStack } from '../cdk/wms-connector-stack';

const app = new cdk.App();
const stage = (app.node.tryGetContext('stage') as string) || 'main';

new WmsConnectorStack(app, `WmsConnectorStack-${stage}`, {
  stage,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
