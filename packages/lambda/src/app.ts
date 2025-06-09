import { timingSafeEqual } from "node:crypto"

import { Hono, HonoRequest } from "hono"
import { basicAuth } from "hono/basic-auth"
import { Logger } from "@aws-lambda-powertools/logger"
import {
  DescribeDeliveryStreamCommand,
  FirehoseClient,
} from "@aws-sdk/client-firehose"

import type { LokiLogPushRecord } from "./loki.js"
import { publishRecordsAsync } from "./log-publisher.js"
import { transformRecords } from "./loki-transformer.js"

/**
 * Options for creating the application.
 */
export interface AppOptions {
  /**
   * The Firehose client used to send logs to the delivery stream.
   */
  firehoseClient: FirehoseClient

  /**
   * The name of the Firehose delivery stream where logs will be sent.
   */
  firehoseDeliveryStreamName: string

  /**
   * Username for basic authentication.
   */
  authUsername: string

  /**
   * Password for basic authentication.
   */
  authPassword: string

  /**
   * Logger instance for logging messages.
   */
  logger: Logger
}

export function createApp(options: AppOptions) {
  const {
    firehoseClient,
    firehoseDeliveryStreamName,
    authUsername,
    authPassword,
    logger,
  } = options

  const expectedUsername = authUsername
  const expectedPassword = Buffer.from(authPassword)

  const app = new Hono()

  app.get("/healthz", async (c) => {
    try {
      const command = new DescribeDeliveryStreamCommand({
        DeliveryStreamName: firehoseDeliveryStreamName,
      })

      const response = await firehoseClient.send(command)

      if (
        response.DeliveryStreamDescription?.DeliveryStreamStatus !== "ACTIVE"
      ) {
        logger.error(
          `Firehose delivery stream is not active: ${response.DeliveryStreamDescription?.DeliveryStreamStatus}`
        )
        return c.json(
          {
            status: "degraded",
            error: `Firehose delivery stream is not active: ${response.DeliveryStreamDescription?.DeliveryStreamStatus ?? "unavailable"}`,
          },
          503
        )
      }
    } catch (e) {
      logger.error(`Failed to describe Firehose delivery stream`, { error: e })
      return c.json(
        {
          status: "degraded",
          error: `Failed to find Firehose delivery stream`,
        },
        503
      )
    }

    return c.json({ status: "healthy" }, 200)
  })

  app.post(
    "/loki/api/v1/push",
    basicAuth({
      verifyUser(username, password) {
        if (username !== expectedUsername) {
          return false
        } else if (password.length !== expectedPassword.length) {
          return false
        }

        return timingSafeEqual(Buffer.from(password), expectedPassword)
      },
    }),
    async (c) => {
      const records = await parseReqJsonBody<LokiLogPushRecord>(c.req)
      if (
        !records ||
        "streams" in records === false ||
        !Array.isArray(records.streams)
      ) {
        return c.json({ error: "Invalid request body" }, 400)
      }

      const transformed = transformRecords(records)
      if (transformed.length > 0) {
        await publishRecordsAsync(
          firehoseClient,
          firehoseDeliveryStreamName,
          transformed,
          logger
        )
      }

      return c.json({ status: "success", count: transformed.length }, 200)
    }
  )

  async function parseReqJsonBody<T>(req: HonoRequest): Promise<T> {
    if (req.raw.body && req.header("Content-Encoding") === "gzip") {
      logger.debug("Decompressing gzip body")
      const decompressed = req.raw.body?.pipeThrough(
        new DecompressionStream("gzip")
      )
      const json = await new Response(decompressed).json()
      return json as T
    }

    return req.json<T>()
  }

  return app
}
