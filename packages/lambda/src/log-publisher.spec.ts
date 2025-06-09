import { describe, jest, expect, test } from "@jest/globals"
import {
  FirehoseClient,
  PutRecordBatchCommand,
  PutRecordBatchCommandOutput,
} from "@aws-sdk/client-firehose"
import { Logger } from "@aws-lambda-powertools/logger"

import { publishRecordsAsync } from "./log-publisher.js"
import { LogRecord } from "./loki-transformer.js"

describe("Log Publisher", () => {
  test("should publish records to Firehose", async () => {
    const mockFirehoseClient = {
      send: jest
        .fn<
          (
            command: PutRecordBatchCommand
          ) => Promise<PutRecordBatchCommandOutput>
        >()
        .mockResolvedValue({
          FailedPutCount: 0,
          RequestResponses: [{ RecordId: "0" }],
          $metadata: {},
        }),
    }

    const transformedRecords = [
      {
        timestamp: "2021-06-01T11:43:20.000Z",
        record: { message: "Test log message" },
        stream: { job: "test-job" },
        metadata: {},
      },
    ]

    await publishRecordsAsync(
      mockFirehoseClient as unknown as FirehoseClient,
      "test-stream",
      transformedRecords
    )

    expect(mockFirehoseClient.send).toHaveBeenCalled()
    expect(mockFirehoseClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          DeliveryStreamName: "test-stream",
          Records: expect.arrayContaining([
            expect.objectContaining({
              Data: expect.any(Buffer),
            }),
          ]),
        }),
      })
    )
  })

  test("should handle empty records gracefully", async () => {
    const mockFirehoseClient = {
      send: jest
        .fn<
          (
            command: PutRecordBatchCommand
          ) => Promise<PutRecordBatchCommandOutput>
        >()
        .mockResolvedValue({
          FailedPutCount: 0,
          RequestResponses: [],
          $metadata: {},
        }),
    }
    const transformedRecords: LogRecord[] = []
    await publishRecordsAsync(
      mockFirehoseClient as unknown as FirehoseClient,
      "test-stream",
      transformedRecords
    )
    expect(mockFirehoseClient.send).toBeCalledTimes(0)
  })

  test("should handle large batches of records", async () => {
    const mockFirehoseClient = {
      send: jest
        .fn<
          (
            command: PutRecordBatchCommand
          ) => Promise<PutRecordBatchCommandOutput>
        >()
        .mockResolvedValue({
          FailedPutCount: 0,
          RequestResponses: Array.from({ length: 500 }, (_, i) => ({
            RecordId: `${i}`,
          })),
          $metadata: {},
        })
        .mockResolvedValue({
          FailedPutCount: 0,
          RequestResponses: Array.from({ length: 3 }, (_, i) => ({
            RecordId: `${i + 500}`,
          })),
          $metadata: {},
        }),
    }

    const transformedRecords = Array.from({ length: 503 }, (_, i) => ({
      timestamp: new Date(Date.now() - 100000 + i).toISOString(),
      record: { message: `Test log message ${i}` },
      stream: { job: "test-job" },
      metadata: {},
    }))

    await publishRecordsAsync(
      mockFirehoseClient as unknown as FirehoseClient,
      "test-stream",
      transformedRecords
    )

    expect(mockFirehoseClient.send).toHaveBeenCalledTimes(2)
    expect(mockFirehoseClient.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: expect.objectContaining({
          DeliveryStreamName: "test-stream",
          Records: expect.arrayContaining([
            expect.objectContaining({
              Data: expect.any(Buffer),
            }),
          ]),
        }),
      })
    )

    // Ensure the record count is 500 in the first batch call
    const call1 = mockFirehoseClient.send.mock.calls[0]
    expect(call1).toBeDefined()
    const arg0 = call1?.[0] as PutRecordBatchCommand
    expect(arg0).toBeDefined()
    expect(arg0.input.Records).toBeDefined()
    expect(arg0.input.Records).toHaveLength(500)

    expect(mockFirehoseClient.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: expect.objectContaining({
          DeliveryStreamName: "test-stream",
          Records: expect.arrayContaining([
            expect.objectContaining({
              Data: expect.any(Buffer),
            }),
          ]),
        }),
      })
    )

    // Ensure the record count is 500 in the first batch call
    const call2 = mockFirehoseClient.send.mock.calls[1]
    expect(call2).toBeDefined()
    const arg2 = call2?.[0] as PutRecordBatchCommand
    expect(arg2).toBeDefined()
    expect(arg2.input.Records).toBeDefined()
    expect(arg2.input.Records).toHaveLength(3)
  })

  test("should handle large batches of records (in bytes)", async () => {
    const mockFirehoseClient = {
      send: jest
        .fn<
          (
            command: PutRecordBatchCommand
          ) => Promise<PutRecordBatchCommandOutput>
        >()
        .mockResolvedValue({
          FailedPutCount: 0,
          RequestResponses: Array.from({ length: 8 }, (_, i) => ({
            RecordId: `${i}`,
          })),
          $metadata: {},
        })
        .mockResolvedValue({
          FailedPutCount: 0,
          RequestResponses: Array.from({ length: 2 }, (_, i) => ({
            RecordId: `${i + 8}`,
          })),
          $metadata: {},
        }),
    }

    // 4 MB / 8 = 524,288 bytes per record
    // ~128 bytes of overhead per record
    // 524,288 - 128 = 524,160 bytes of actual data
    const transformedRecords = Array.from({ length: 10 }, (_, i) => ({
      timestamp: new Date(Date.now() - 100000 + i).toISOString(),
      record: { message: "a".repeat(524160) },
      stream: { job: "test-job" },
      metadata: {},
    }))

    await publishRecordsAsync(
      mockFirehoseClient as unknown as FirehoseClient,
      "test-stream",
      transformedRecords
    )

    expect(mockFirehoseClient.send).toHaveBeenCalledTimes(2)
    expect(mockFirehoseClient.send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: expect.objectContaining({
          DeliveryStreamName: "test-stream",
          Records: expect.arrayContaining([
            expect.objectContaining({
              Data: expect.any(Buffer),
            }),
          ]),
        }),
      })
    )

    // Ensure the record count is 500 in the first batch call
    const call1 = mockFirehoseClient.send.mock.calls[0]
    expect(call1).toBeDefined()
    const arg0 = call1?.[0] as PutRecordBatchCommand
    expect(arg0).toBeDefined()
    expect(arg0.input.Records).toBeDefined()
    expect(arg0.input.Records).toHaveLength(8)

    expect(mockFirehoseClient.send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: expect.objectContaining({
          DeliveryStreamName: "test-stream",
          Records: expect.arrayContaining([
            expect.objectContaining({
              Data: expect.any(Buffer),
            }),
          ]),
        }),
      })
    )

    // Ensure the record count is 500 in the first batch call
    const call2 = mockFirehoseClient.send.mock.calls[1]
    expect(call2).toBeDefined()
    const arg2 = call2?.[0] as PutRecordBatchCommand
    expect(arg2).toBeDefined()
    expect(arg2.input.Records).toBeDefined()
    expect(arg2.input.Records).toHaveLength(2)
  })

  test("should handle Failed PUT count", async () => {
    const mockFirehoseClient = {
      send: jest
        .fn<
          (
            command: PutRecordBatchCommand
          ) => Promise<PutRecordBatchCommandOutput>
        >()
        .mockResolvedValue({
          FailedPutCount: 1,
          RequestResponses: [{ ErrorCode: "SomeError", ErrorMessage: "Error" }],
          $metadata: {},
        }),
    }
    const mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as Logger

    const transformedRecords = [
      {
        timestamp: "2021-06-01T11:43:20.000Z",
        record: { message: "Test log message" },
        stream: { job: "test-job" },
        metadata: {},
      },
    ]
    await publishRecordsAsync(
      mockFirehoseClient as unknown as FirehoseClient,
      "test-stream",
      transformedRecords,
      mockLogger
    )

    expect(mockLogger.error).toHaveBeenCalled()
    expect(mockFirehoseClient.send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          DeliveryStreamName: "test-stream",
          Records: expect.arrayContaining([
            expect.objectContaining({
              Data: expect.any(Buffer),
            }),
          ]),
        }),
      })
    )
  })
})
