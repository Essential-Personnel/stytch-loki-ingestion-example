import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"

import { LokiLogIngestionStack } from "./LokiLogIngestionStack"

export interface LokiLogIngestionStageProps extends cdk.StageProps {
  /**
   * Optional number of days to retain logs in S3 before expiration.
   * If not provided, logs will not expire.
   */
  readonly expirationDays?: number

  /**
   * Tags to apply to the stage and all resources within it.
   */
  readonly tags: Record<string, string>
}

export class LokiLogIngestionStage extends cdk.Stage {
  constructor(
    scope: Construct,
    id: string,
    props?: LokiLogIngestionStageProps
  ) {
    super(scope, id, props)

    new LokiLogIngestionStack(this, "LokiLogIngestion", {
      expirationDays: props?.expirationDays,
    })

    for (const [key, value] of Object.entries(props?.tags ?? {})) {
      cdk.Tags.of(this).add(key, value)
    }
  }
}
