## 1. Environment config

- [ ] 1.1 Add SecretPaths for vpc, vpcDefault, iamPath, iamPathDefault, iamPermissionsBoundary, iamPermissionsBoundaryDefault in src/environment-config.ts
- [ ] 1.2 Add VpcConfig interface (id, dataSubnets, privateSubnets, publicSubnets) in src/environment-config.ts
- [ ] 1.3 Extend FullEnvironmentConfig with vpc, iamPath, iamPermissionsBoundary in src/environment-config.ts
- [ ] 1.4 Update loadEnvironmentSecrets to fetch vpc, iamPath, and iamPermissionsBoundary using getSecretWithFallback and include them in the returned object
- [ ] 1.5 Update getFullEnvironmentConfig to merge the new secrets from loadEnvironmentSecrets into the full config

## 2. CDK stack

- [ ] 2.1 Change WmsConnectorStackProps to accept fullConfig: FullEnvironmentConfig instead of stage only
- [ ] 2.2 Use Vpc.fromVpcAttributes with fullConfig.vpc (id, availabilityZones, privateSubnetIds) and remove VPC creation and vpcId context branch
- [ ] 2.3 Set permissionsBoundary and path on the task role using fullConfig.iamPermissionsBoundary and fullConfig.iamPath
- [ ] 2.4 Set the Fargate service vpcSubnets to use subnets from fullConfig.vpc (e.g. privateSubnets or dataSubnets)
- [ ] 2.5 Add execution role to the Fargate task definition if not present, and set permissionsBoundary and path on it from fullConfig

## 3. CDK entrypoint

- [ ] 3.1 Load full environment config asynchronously in src/bin/wms-connector.ts (getFullEnvironmentConfig(stage)) before constructing the stack
- [ ] 3.2 Pass the loaded fullConfig to WmsConnectorStack and ensure the app waits for config load before synth (e.g. async IIFE or .then())

## 4. Deploy workflow

- [ ] 4.1 Add -c stage=$STAGE_NAME to the cdk deploy command in .github/workflows/deploy.yml

## 5. Secrets and verification

- [ ] 5.1 Verify or document required Secrets Manager secrets: mmdl/default/vpc, mmdl/default/iam/path, mmdl/default/iam/permissionsBoundary (create from appian/default if missing)
