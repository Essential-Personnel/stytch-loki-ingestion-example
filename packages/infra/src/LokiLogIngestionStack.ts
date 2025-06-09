import * as path from "node:path"

import * as cdk from "aws-cdk-lib"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import { Construct } from "constructs"
import { KinesisFirehoseToS3 } from "@aws-solutions-constructs/aws-kinesisfirehose-s3"
import { LambdaToKinesisFirehose } from "@aws-solutions-constructs/aws-lambda-kinesisfirehose"

export interface LokiLogIngestionStackProps extends cdk.StackProps {
  /**
   * Optional number of days to retain logs in S3 before expiration.
   * If not provided, logs will not expire.
   */
  readonly expirationDays?: number
}

export class LokiLogIngestionStack extends cdk.Stack {
  constructor(
    scope: Construct,
    id: string,
    props?: LokiLogIngestionStackProps
  ) {
    super(scope, id, props)

    const kinesisFirehose = new KinesisFirehoseToS3(this, "FirehoseToS3", {
      bucketProps: {
        encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        lifecycleRules: [
          {
            expiration: props?.expirationDays
              ? cdk.Duration.days(props.expirationDays)
              : undefined,
            transitions: [
              {
                storageClass: cdk.aws_s3.StorageClass.INFREQUENT_ACCESS,
                transitionAfter: cdk.Duration.days(30), // Transition to Infrequent Access after 30 days
                /* CAW: Why not 0 days?
                 * 9:56:56 AM | CREATE_FAILED        | AWS::S3::Bucket                      | FirehoseToS3S3Bucket36B67902
                 * Resource handler returned message: "'Days' in Transition action must be greater than or equal to 30 for
                 * storageClass 'STANDARD_IA'
                 */
              },
            ],
          },
        ],
      },
      logS3AccessLogs: true,
    })

    const authSecret = new secretsmanager.Secret(this, "LokiAuthSecret", {
      description:
        "Username and password for Basic auth in the Loki ingestion Lambda function",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: "stytch-logs-ingestion",
        }),
        generateStringKey: "password",
        excludePunctuation: true, // Exclude punctuation for easier use in URLs
      },
    })

    const lambdaFn = new LambdaToKinesisFirehose(this, "LokiIngestion", {
      existingKinesisFirehose: kinesisFirehose.kinesisFirehose,
      lambdaFunctionProps: {
        runtime: cdk.aws_lambda.Runtime.NODEJS_22_X,
        handler: "index.handler",
        memorySize: 1024, // accepting gzip encoded payload, need higher default memory size
        timeout: cdk.Duration.seconds(15),
        code: cdk.aws_lambda.Code.fromAsset(
          path.join(__dirname, "../../lambda/dist/function.zip")
        ),
        environment: {
          FIREHOSE_DELIVERYSTREAM_NAME:
            kinesisFirehose.kinesisFirehose.deliveryStreamName ?? "",
          AUTH_SECRET_ARN: authSecret.secretArn,
          AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1", // Enable connection reuse for better performance
        },
        loggingFormat: cdk.aws_lambda.LoggingFormat.JSON,
      },
    })

    // Setup a Lambda Function URL for the ingestion Lambda
    lambdaFn.lambdaFunction.addFunctionUrl({
      authType: cdk.aws_lambda.FunctionUrlAuthType.NONE,
    })

    // Grant Lambda permission to describe the Firehose delivery stream
    lambdaFn.lambdaFunction.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: ["firehose:DescribeDeliveryStream"],
        resources: [kinesisFirehose.kinesisFirehose.attrArn],
      })
    )

    // Grant Lambda permission to read the secret for HTTP Basic auth
    authSecret.grantRead(lambdaFn.lambdaFunction)
  }
}
