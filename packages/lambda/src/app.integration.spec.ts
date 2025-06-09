import { Logger } from "@aws-lambda-powertools/logger"
import { FirehoseClient } from "@aws-sdk/client-firehose"
import {
  describe,
  expect,
  test,
  jest,
  beforeAll,
  afterAll,
} from "@jest/globals"

import {
  LocalstackContainer,
  StartedLocalStackContainer,
} from "@testcontainers/localstack"
import { createApp } from "./app.js"

const firehoseDeliveryStreamName = "test-stream"
const authUsername = "testuser"
const authPassword = "testpassword"

const headers = {
  Authorization: `Basic ${Buffer.from(`${authUsername}:${authPassword}`).toString("base64")}`,
}

const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as Logger

const delay = (timeInMs: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeInMs)
  })
}

describe("App Integration Tests", () => {
  let localstack: StartedLocalStackContainer
  let firehoseClient: FirehoseClient
  let app: ReturnType<typeof createApp>

  beforeAll(async () => {
    localstack = await new LocalstackContainer("localstack/localstack:stable")
      .withEnvironment({
        SERVICES: "s3,firehose,sts,iam",
      })
      .start()

    await localstack.exec(["awslocal", "s3", "mb", "s3://test-bucket"])
    await localstack.exec([
      "awslocal",
      "firehose",
      "create-delivery-stream",
      "--delivery-stream-name",
      firehoseDeliveryStreamName,
      "--extended-s3-destination-configuration",
      '{"BucketARN": "arn:aws:s3:::test-bucket", "RoleARN": "arn:aws:iam::000000000000:role/firehose_delivery_role"}',
    ])

    firehoseClient = new FirehoseClient({
      region: "us-east-1",
      endpoint: localstack.getConnectionUri(),
      credentials: {
        secretAccessKey: "test",
        accessKeyId: "test",
      },
    })

    app = createApp({
      firehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })
  }, 60_000)

  afterAll(async () => {
    await localstack.stop()
  }, 60_000)

  test("App health check should return 200", async () => {
    const healthCheck = await app.request("/healthz", {
      method: "GET",
      headers,
    })
    expect(healthCheck.status).toBe(200)
    const healthResponse = await healthCheck.json()
    expect(healthResponse).toEqual({ status: "healthy" })
  })

  test("App should publish logs to Firehose", async () => {
    const logPayload = {
      streams: [
        {
          stream: { job: "test-job" },
          values: [
            [
              "1622547800000000000",
              JSON.stringify({
                timestamp: new Date().toISOString(),
                message: "Test log message",
              }),
            ],
          ],
        },
      ],
    }

    const response = await app.request("/loki/api/v1/push", {
      method: "POST",
      body: JSON.stringify(logPayload),
      headers,
    })

    expect(response.status).toBe(200)
    const responseBody = await response.json()
    expect(responseBody).toEqual({ status: "success", count: 1 })

    await delay(2_000) // Wait for Firehose to process the record

    const records = await localstack.exec([
      "awslocal",
      "s3api",
      "list-objects",
      "--bucket",
      "test-bucket",
    ])
    expect(records.output).toMatch(
      /"Key":\s"\d{4}\/\d{2}\/\d{2}\/\d{2}\/test-stream-[0-9a-fA-F-]+",/
    )
  }, 10_000)
})
