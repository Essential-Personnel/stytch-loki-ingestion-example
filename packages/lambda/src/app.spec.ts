import { gzipSync } from "node:zlib"

import { describe, jest, expect, test, it } from "@jest/globals"
import {
  DescribeDeliveryStreamCommandOutput,
  FirehoseClient,
  PutRecordBatchCommandOutput,
} from "@aws-sdk/client-firehose"
import { Logger } from "@aws-lambda-powertools/logger"

import { createApp } from "./app.js"

const firehoseDeliveryStreamName = "test-stream"
const authUsername = "testuser"
const authPassword = "testpassword"

const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
} as unknown as Logger

describe("App Creation", () => {
  test("should create an app instance with the correct properties", () => {
    const mockFirehoseClient = {} as FirehoseClient

    const app = createApp({
      firehoseClient: mockFirehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })

    expect(app).toBeDefined()
    expect(app).toHaveProperty("get")
    expect(app.get).toBeInstanceOf(Function)
    expect(app).toHaveProperty("post")
    expect(app.post).toBeInstanceOf(Function)
  })
})

describe("Health Check Endpoint", () => {
  test("healthz endpoint should return 200 status", async () => {
    // Arrange
    const successResponse: DescribeDeliveryStreamCommandOutput = {
      DeliveryStreamDescription: {
        DeliveryStreamName: firehoseDeliveryStreamName,
        DeliveryStreamStatus: "ACTIVE",
        CreateTimestamp: new Date(),
        DeliveryStreamARN:
          "arn:aws:firehose:region:account-id:deliverystream/test-stream",
        DeliveryStreamType: "DirectPut",
        VersionId: "1",
        Destinations: [],
        HasMoreDestinations: false,
      },
      $metadata: {},
    }
    const mockFirehoseClient = {
      send: jest
        .fn<() => Promise<DescribeDeliveryStreamCommandOutput>>()
        .mockResolvedValue(successResponse),
    } as unknown as FirehoseClient

    const app = createApp({
      firehoseClient: mockFirehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })

    // Act
    const response = await app.request("/healthz", { method: "GET" })

    // Assert
    expect(response.status).toBe(200)
    const responseBody = await response.json()
    expect(responseBody).toEqual({ status: "healthy" })
  })

  test("healthz endpoint should return 503 status if Firehose stream is not active", async () => {
    // Arrange
    const failedResponse: DescribeDeliveryStreamCommandOutput = {
      DeliveryStreamDescription: {
        DeliveryStreamName: firehoseDeliveryStreamName,
        DeliveryStreamStatus: "DELETING",
        CreateTimestamp: new Date(),
        DeliveryStreamARN:
          "arn:aws:firehose:region:account-id:deliverystream/test-stream",
        DeliveryStreamType: "DirectPut",
        VersionId: "1",
        Destinations: [],
        HasMoreDestinations: false,
      },
      $metadata: {},
    }
    const mockFirehoseClient = {
      send: jest
        .fn<() => Promise<DescribeDeliveryStreamCommandOutput>>()
        .mockResolvedValue(failedResponse),
    } as unknown as FirehoseClient

    const app = createApp({
      firehoseClient: mockFirehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })

    // Act
    const response = await app.request("/healthz", { method: "GET" })

    // Assert
    expect(response.status).toBe(503)
    const responseBody = await response.json()
    expect(responseBody).toEqual({
      status: "degraded",
      error: "Firehose delivery stream is not active: DELETING",
    })
  })
})

describe("Basic Authentication", () => {
  test("should authenticate with correct credentials", async () => {
    // Arrange
    const mockFirehoseClient = {} as FirehoseClient

    const app = createApp({
      firehoseClient: mockFirehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })

    // Act
    const response = await app.request("/loki/api/v1/push", {
      method: "POST",
      body: JSON.stringify({ streams: [] }),
      headers: {
        Authorization: `Basic ${Buffer.from(`${authUsername}:${authPassword}`).toString("base64")}`,
      },
    })

    // Assert
    expect(response.status).toBe(200)
  })

  it.each([
    ["testuser", "wrongpassword"],
    ["wronguser", "testpassword"],
  ])("should reject with incorrect credentials: %s", async (user, pass) => {
    // Arrange
    const mockFirehoseClient = {} as FirehoseClient

    const app = createApp({
      firehoseClient: mockFirehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })

    // Act
    const response = await app.request("/loki/api/v1/push", {
      method: "POST",
      body: JSON.stringify({ streams: [] }),
      headers: {
        Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
      },
    })

    // Assert
    expect(response.status).toBe(401)
  })
})

describe("Loki Log Push Endpoint publishes to Firehose Client", () => {
  test("should publish transformed records to Firehose", async () => {
    // Arrange
    const output: PutRecordBatchCommandOutput = {
      FailedPutCount: 0,
      RequestResponses: [{ RecordId: "0" }, { RecordId: "1" }],
      $metadata: {},
    }
    const mockFirehoseClient = {
      send: jest
        .fn<() => Promise<PutRecordBatchCommandOutput>>()
        .mockResolvedValue(output),
    } as unknown as FirehoseClient

    const app = createApp({
      firehoseClient: mockFirehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })

    const lokiPushRecord = {
      streams: [
        {
          stream: { job: "test-job" },
          values: [
            ["1622547800000000000", '{"x": "Test log message"}'],
            ["1622547801000000000", "Another log message"],
          ],
        },
      ],
    }

    // Act
    const response = await app.request("/loki/api/v1/push", {
      method: "POST",
      body: JSON.stringify(lokiPushRecord),
      headers: {
        Authorization: `Basic ${Buffer.from(`${authUsername}:${authPassword}`).toString("base64")}`,
      },
    })

    // Assert
    expect(response.status).toBe(200)
    const responseBody = await response.json()
    expect(responseBody).toEqual({ status: "success", count: 2 })
    expect(mockFirehoseClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          DeliveryStreamName: "test-stream",
          Records: expect.arrayContaining([
            expect.objectContaining({
              Data: expect.any(Buffer),
            }),
            expect.objectContaining({
              Data: expect.any(Buffer),
            }),
          ]),
        }),
      })
    )
  })

  test("should accept gzip encoded requests", async () => {
    // Arrange
    const output: PutRecordBatchCommandOutput = {
      FailedPutCount: 0,
      RequestResponses: [{ RecordId: "0" }, { RecordId: "1" }],
      $metadata: {},
    }
    const mockFirehoseClient = {
      send: jest
        .fn<() => Promise<PutRecordBatchCommandOutput>>()
        .mockResolvedValue(output),
    } as unknown as FirehoseClient
    const app = createApp({
      firehoseClient: mockFirehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })

    const lokiPushRecord = {
      streams: [
        {
          stream: { job: "test-job" },
          values: [
            ["1622547800000000000", '{"x": "Test log message"}'],
            ["1622547801000000000", "Another log message"],
          ],
        },
      ],
    }

    const compressed = gzipSync(Buffer.from(JSON.stringify(lokiPushRecord)))
    const arrayBuffer = compressed.buffer.slice(
      compressed.byteOffset,
      compressed.byteOffset + compressed.byteLength
    )

    const response = await app.request("/loki/api/v1/push", {
      method: "POST",
      body: arrayBuffer as ArrayBuffer,
      headers: {
        Authorization: `Basic ${Buffer.from(`${authUsername}:${authPassword}`).toString("base64")}`,
        "Content-Encoding": "gzip",
        "Content-Type": "application/json",
      },
    })

    expect(response.status).toBe(200)
    const responseBody = await response.json()
    expect(responseBody).toEqual({ status: "success", count: 2 })
  })

  test("should return 400 for invalid Loki log push records", async () => {
    // Arrange
    const mockFirehoseClient = {} as FirehoseClient

    const app = createApp({
      firehoseClient: mockFirehoseClient,
      firehoseDeliveryStreamName,
      authUsername,
      authPassword,
      logger: mockLogger,
    })

    // Act
    const response = await app.request("/loki/api/v1/push", {
      method: "POST",
      body: JSON.stringify({ invalid: "data" }),
      headers: {
        Authorization: `Basic ${Buffer.from(`${authUsername}:${authPassword}`).toString("base64")}`,
      },
    })

    // Assert
    expect(response.status).toBe(400)
    const responseBody = await response.json()
    expect(responseBody).toEqual({ error: "Invalid request body" })
  })
})
