import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorMessage =
      typeof message === 'object' && 'message' in (message as object)
        ? (message as { message: string | string[] }).message
        : message;

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // A thrown object may carry a machine-readable `code` alongside its
    // message — clients branch on that rather than string-matching the
    // human text, which changes freely.
    const payload = (typeof message === 'object' && message !== null
      ? message as Record<string, unknown>
      : {});
    const errorCode = typeof payload.error === 'string' && payload.error !== errorMessage
      ? payload.error
      : undefined;

    response.status(status).json({
      success: false,
      statusCode: status,
      error: errorMessage,
      ...(errorCode && { code: errorCode }),
      // Extra context the thrower attached, e.g. which email needs verifying.
      ...(typeof payload.email === 'string' && { email: payload.email }),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
