import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { ApiErrorDto } from "../common/http/api-error.dto.js";
import { MarkReadResponseDto } from "./dto/mark-read-response.dto.js";
import { NotificationsResponseDto } from "./dto/notifications-response.dto.js";
import { NotificationsService } from "./notifications.service.js";

@ApiTags("notifications")
@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly notificationsService: NotificationsService
  ) {}

  @Get()
  @ApiOperation({ operationId: "listNotifications" })
  @ApiCookieAuth()
  @ApiOkResponse({ type: NotificationsResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  list(
    @Req() request: AuthenticatedRequest
  ): Promise<NotificationsResponseDto> {
    return this.notificationsService.listForUser(request.auth.user.id);
  }

  @Patch(":id/read")
  @UseGuards(CsrfGuard)
  @ApiOperation({ operationId: "markNotificationRead" })
  @ApiCookieAuth()
  @ApiHeader({
    name: "X-CSRF-Token",
    required: true,
    schema: { type: "string" }
  })
  @ApiParam({
    name: "id",
    required: true,
    schema: { type: "string", format: "uuid" }
  })
  @ApiOkResponse({ type: MarkReadResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 404, type: ApiErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  markRead(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Req() request: AuthenticatedRequest
  ): Promise<MarkReadResponseDto> {
    return this.notificationsService.markAsRead(request.auth.user.id, id);
  }
}
