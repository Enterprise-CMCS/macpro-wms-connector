## 1. Remove Default Stage

- [x] 1.1 Remove `"stage": "main"` from `cdk.json` context
- [x] 1.2 Update `wms-connector.ts` to require explicit stage with clear error message

## 2. Verification

- [x] 2.1 Verify `cdk synth` without stage flag fails with clear error
- [x] 2.2 Verify `cdk synth -c stage=main` succeeds
