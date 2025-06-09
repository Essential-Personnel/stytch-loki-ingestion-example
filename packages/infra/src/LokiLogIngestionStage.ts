import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"

import { LokiLogIngestionStack } from "./LokiLogIngestionStack"

export interface LokiLogIngestionStageProps extends cdk.StageProps {
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

    new LokiLogIngestionStack(this, "LokiLogIngestion")

    for (const [key, value] of Object.entries(props?.tags ?? {})) {
      cdk.Tags.of(this).add(key, value)
    }
  }
}
