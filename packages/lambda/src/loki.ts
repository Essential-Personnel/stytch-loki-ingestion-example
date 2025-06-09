/**
 * Represents a single log entry in a Loki stream.
 * Each entry consists of a timestamp (Nanoseconds since the UNIX epoch)
 * and a log message, which may optionally include metadata.
 */
export type LokiLogStreamValue =
  | [string, string]
  | [string, string, Record<string, string>]

/**
 * Represents a batch of log entries in a Loki stream.
 */
export interface LokiStreamRecord {
  /**
   * The stream labels associated with the log entries.
   */
  stream: Record<string, string>

  /**
   * The log entries associated with the stream.
   */
  values: LokiLogStreamValue[]
}

/**
 * Represents a Loki log push record containing multiple streams.
 * Each stream contains its own set of log entries.
 */
export interface LokiLogPushRecord {
  streams: LokiStreamRecord[]
}
