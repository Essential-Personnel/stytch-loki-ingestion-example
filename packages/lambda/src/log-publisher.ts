import {
  FirehoseClient,
  PutRecordBatchCommand,
  PutRecordBatchInput,
} from "@aws-sdk/client-firehose"
import { Logger } from "@aws-lambda-powertools/logger"

import { LogRecord } from "./loki-transformer.js"

/**
 * Publishes transformed log records to the specified Firehose delivery stream.
 * @param firehoseClient Instance of FirehoseClient to interact with AWS Firehose.
 * @param deliveryStreamName Name of the Firehose delivery stream to publish records to.
 * @param transformed Array of transformed log records.
 * @param logger Optional logger instance for logging information and errors.
 */
export async function publishRecordsAsync(
  firehoseClient: FirehoseClient,
  deliveryStreamName: string,
  transformed: LogRecord[],
  logger?: Logger
): Promise<void> {
  logger?.debug(`Publishing ${transformed.length} log records`)

  const batches: PutRecordBatchInput["Records"][] = []

  const maximumBatchSize = 500 // Maximum number of records per Firehose batch
  const maximumBatchSizeBytes = 4 * 1024 * 1024 // 4 MB per Firehose

  let batchSizeBytes = 0
  let batch: PutRecordBatchInput["Records"] = []
  for (let i = 0; i < transformed.length; i++) {
    const record = {
      Data: Buffer.from(JSON.stringify(transformed[i]) + "\n"),
    }

    if (
      batch.length === maximumBatchSize ||
      batchSizeBytes + record.Data.length > maximumBatchSizeBytes
    ) {
      batches.push(batch)
      batch = []
      batchSizeBytes = 0
    }

    batch.push(record)
    batchSizeBytes += record.Data.length
  }

  if (batch.length > 0) {
    batches.push(batch)
  }

  logger?.debug(`Prepared ${batches.length} batches for Firehose`)

  let batchId = 0
  for (const batch of batches) {
    const command = new PutRecordBatchCommand({
      DeliveryStreamName: deliveryStreamName,
      Records: batch,
    })

    const response = await firehoseClient.send(command)
    if (response.FailedPutCount && response.FailedPutCount > 0) {
      logger?.error(
        `Failed to put ${response.FailedPutCount} records to Firehose`
      )
    }

    logger?.info(
      `[Batch ${++batchId} of ${batches.length}] Successfully published ${(response.RequestResponses ?? []).reduce((acc, curr) => acc + (curr.ErrorCode ? 0 : 1), 0)} log records to Firehose`
    )
  }
}
