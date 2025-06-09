#!/usr/bin/env node
import * as cdk from "aws-cdk-lib"

import { LokiLogIngestionStage } from "../src/LokiLogIngestionStage"

const app = new cdk.App()

new LokiLogIngestionStage(app, "Dev", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  expirationDays: 7, // example: retain logs for 7 days in dev environment
  tags: {
    env: "dev",
    app: "stytch-logs-ingestion",
  },
})

new LokiLogIngestionStage(app, "Staging", {
  // TODO: Replace with your staging account and region
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  /*env: {
    account: "your-staging-account-id",
    region: "your-staging-region",
  },*/
  expirationDays: 90, // example: retain logs for 90 days in staging environment
  tags: {
    env: "staging",
    app: "stytch-logs-ingestion",
  },
})

new LokiLogIngestionStage(app, "Prod", {
  // TODO: Replace with your production account and region
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  /*env: {
    account: "your-prod-account-id",
    region: "your-prod-region",
  },*/
  tags: {
    env: "prod",
    app: "stytch-logs-ingestion",
  },
})
