import { Env, MiddlewareHandler } from "hono"
import { Logger } from "@aws-lambda-powertools/logger"
import { LambdaContext, LambdaEvent } from "hono/aws-lambda"

//
// Based on: https://github.com/honojs/hono/blob/main/src/middleware/logger/index.ts
// Based on: https://github.com/aws-powertools/powertools-lambda-typescript/blob/main/packages/logger/src/Logger.ts#L482
//

const humanize = (times: string[]) => {
  const [delimiter, separator] = [",", "."]

  const orderTimes = times.map((v) =>
    v.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1" + delimiter)
  )

  return orderTimes.join(separator)
}

const time = (start: number) => {
  const delta = Date.now() - start
  return humanize([
    delta < 1000 ? delta + "ms" : Math.round(delta / 1000) + "s",
  ])
}

/**
 * Environment interface for Hono Lambda applications.
 */
export interface HonoLambdaEnv extends Env {
  Bindings: {
    event: LambdaEvent
    lambdaContext: LambdaContext
  }
}

/**
 * Middleware for logging AWS Lambda requests and responses in a Hono application using AWS Powertools Logger.
 *
 * This middleware logs the incoming HTTP method and path, response status, and request duration.
 * It also enriches logs with Lambda context and event information, sets correlation IDs, and handles error logging.
 *
 * @template E - The environment type with lambda bindings.
 * @param logger - An instance of AWS Powertools Logger used for structured logging.
 * @returns A Hono middleware handler that logs request and response details for AWS Lambda invocations.
 *
 * @example
 * import { Logger } from "@aws-lambda-powertools/logger";
 * import { lambdaLogger } from "./lambda-logger";
 *
 * const logger = new Logger();
 * app.use("*", lambdaLogger(logger));
 */
export const lambdaLogger = <E extends HonoLambdaEnv>(
  logger: Logger
): MiddlewareHandler<E> => {
  return async function log(c, next) {
    const { method, url } = c.req

    logger.refreshSampleRateCalculation()
    // CAW: Hono does not provide a way to access the AWS Lambda context directly,
    //      instead providing their own type which shadows the AWS Lambda context type.
    logger.addContext({
      ...c.env.lambdaContext,
      done: () => {},
      fail: () => {},
      succeed: () => {},
    })
    logger.logEventIfEnabled(c.env.event)
    logger.setCorrelationId(c.env.lambdaContext.awsRequestId)

    const path = url.slice(url.indexOf("/", 8))

    logger.info(`${method} ${path}`)

    try {
      const start = Date.now()

      await next()

      if (c.res.status < 400) {
        logger.info(`${method} ${path} ${c.res.status} ${time(start)}`)
      } else if (c.res.status < 500) {
        logger.warn(`${method} ${path} ${c.res.status} ${time(start)}`)
      } else {
        logger.error(`${method} ${path} ${c.res.status} ${time(start)}`)
      }
    } catch (e) {
      logger.flushBuffer()
      logger.error("Uncaught error", { error: e })
      throw e // Re-throw the error after logging it
    } finally {
      logger.clearBuffer()
    }
  }
}
