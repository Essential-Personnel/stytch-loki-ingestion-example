import { describe, expect, test } from "@jest/globals"

import { LokiLogPushRecord } from "./loki.js"
import { transformRecords } from "./loki-transformer.js"

describe("Loki Transformer", () => {
  test("should transform Loki log push records correctly", () => {
    const input: LokiLogPushRecord = {
      streams: [
        {
          stream: { job: "test-job" },
          values: [
            ["1622547800000000000", '{"x": "Test log message"}'],
            ["1622547801000000000", "Another log message"],
            [
              "1622547802000000000",
              '{"y": "Another log message"}',
              { key: "value" },
            ],
          ],
        },
      ],
    }

    const expectedOutput = [
      {
        timestamp: "2021-06-01T11:43:20.000Z",
        record: { x: "Test log message" },
        stream: { job: "test-job" },
        metadata: {},
      },
      {
        timestamp: "2021-06-01T11:43:21.000Z",
        record: { message: "Another log message" },
        stream: { job: "test-job" },
        metadata: {},
      },
      {
        timestamp: "2021-06-01T11:43:22.000Z",
        record: { y: "Another log message" },
        stream: { job: "test-job" },
        metadata: { key: "value" },
      },
    ]

    const result = transformRecords(input)
    expect(result).toEqual(expectedOutput)
  })

  test("should handle invalid JSON in log messages gracefully", () => {
    const input: LokiLogPushRecord = {
      streams: [
        {
          stream: { job: "test-job" },
          values: [["1622547802000000000", "{invalid json}", {}]],
        },
      ],
    }

    const expectedOutput = [
      {
        timestamp: "2021-06-01T11:43:22.000Z",
        record: { message: "{invalid json}" },
        stream: { job: "test-job" },
        metadata: {},
      },
    ]

    const result = transformRecords(input)
    expect(result).toEqual(expectedOutput)
  })
})
