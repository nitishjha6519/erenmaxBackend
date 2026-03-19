import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_SERVER_ERROR";
    let message = "An unexpected error occurred";
    let details = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object") {
        const resp = exceptionResponse as any;
        message = resp.message || message;
        details = resp.details || {};
      }

      switch (status) {
        case 400:
          code = "VALIDATION_ERROR";
          break;
        case 401:
          code = "UNAUTHORIZED";
          break;
        case 403:
          code = "FORBIDDEN";
          break;
        case 404:
          code = "NOT_FOUND";
          break;
        case 409:
          code = "CONFLICT";
          break;
        default:
          code = "INTERNAL_SERVER_ERROR";
      }
    }

    response.status(status).json({
      error: {
        code,
        message: Array.isArray(message) ? message.join(", ") : message,
        details,
      },
    });
  }
}
