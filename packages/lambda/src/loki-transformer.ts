import { Logger } from "@aws-lambda-powertools/logger"

import { LokiLogPushRecord } from "./loki.js"

/**
 * Represents a single log record transformed from Loki log push format.
 */
export interface LogRecord {
  /**
   * Timestamp of the log record in ISO 8601 format.
   */
  timestamp: string

  /**
   * The actual log record, which may be a JSON object or a raw message.
   */
  record: object

  /**
   * Metadata associated with the log producer, such as labels or tags.
   */
  stream: Record<string, string>

  /**
   * Additional metadata that may be included with the log record.
   */
  metadata?: Record<string, string>
}

/**
 * Transforms Loki log push records into a format suitable for downstream processing.
 * @param records Loki log push record containing streams and values.
 * @returns Array of transformed log records.
 */
export function transformRecords(
  records: LokiLogPushRecord,
  logger?: Logger
): LogRecord[] {
  return records.streams.flatMap((s) =>
    s.values.map((value) => {
      const [timestampNS, message, metadata] = value

      let jsonRecord: object = { message }
      try {
        if (message.startsWith("{") || message.startsWith("[")) {
          jsonRecord = JSON.parse(message)
        }
      } catch (e) {
        logger?.warn("Failed to parse JSON from Loki log record", { error: e })
        jsonRecord = { message } // Fallback to raw message if parsing fails
      }

      return {
        timestamp: new Date(Number(timestampNS) / 1_000_000).toISOString(),
        record: jsonRecord,
        stream: s.stream,
        metadata: metadata || {},
      }
    })
  )
}
