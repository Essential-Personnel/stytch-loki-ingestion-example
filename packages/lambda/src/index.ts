import { Hono } from "hono"
import { handle } from "hono/aws-lambda"
import { secureHeaders } from "hono/secure-headers"
import { Logger } from "@aws-lambda-powertools/logger"
import { FirehoseClient } from "@aws-sdk/client-firehose"
import { getSecret } from "@aws-lambda-powertools/parameters/secrets"

import { createApp } from "./app.js"
import { HonoLambdaEnv, lambdaLogger } from "./lambda-logger.js"

const logger = new Logger({ serviceName: "stytch-loki-ingestion-lambda" })
const firehoseClient = new FirehoseClient()

const firehoseDeliveryStreamName =
  process.env.FIREHOSE_DELIVERYSTREAM_NAME || "stytch-loki-ingestion-stream"

const { authUsername, authPassword } = await getAuthParams()

const api = createApp({
  firehoseClient,
  firehoseDeliveryStreamName,
  authUsername,
  authPassword,
  logger,
})

const app = new Hono<HonoLambdaEnv>()

app.use(lambdaLogger(logger))
app.use(secureHeaders())

app.route("/", api)

export const handler = handle(app)

async function getAuthParams(): Promise<{
  authUsername: string
  authPassword: string
}> {
  if (process.env.AUTH_SECRET_ARN) {
    const secret = await getSecret<{ username: string; password: string }>(
      process.env.AUTH_SECRET_ARN,
      {
        transform: "json",
      }
    )

    if (!secret) {
      throw new Error("Authentication parameters not found in SecretsManager")
    }

    if (!secret.username || !secret.password) {
      throw new Error(
        "Invalid authentication parameters format in SecretsManager"
      )
    }

    return {
      authUsername: secret.username,
      authPassword: secret.password,
    }
  } else {
    throw new Error("Missing AUTH_SECRET_ARN environment variable")
  }
}
