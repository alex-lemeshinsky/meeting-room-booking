import {
  Body,
  Controller,
  Inject,
  Patch,
  Req,
  UseGuards
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { AuthResponseDto } from "../auth/dto/auth-response.dto.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { ApiErrorDto } from "../common/http/api-error.dto.js";
import { UpdateMeDto } from "./dto/update-me.dto.js";
import { UsersService } from "./users.service.js";

@ApiTags("users")
@Controller("me")
export class UsersController {
  constructor(@Inject(UsersService) private readonly users: UsersService) {}

  @Patch()
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ operationId: "updateMe" })
  @ApiCookieAuth()
  @ApiHeader({
    name: "X-CSRF-Token",
    required: true,
    schema: { type: "string" }
  })
  @ApiBody({ type: UpdateMeDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  async update(
    @Body() input: UpdateMeDto,
    @Req() request: AuthenticatedRequest
  ): Promise<AuthResponseDto> {
    const user = await this.users.updateWeekStartsOn(
      request.auth.user.id,
      input.weekStartsOn
    );
    return { user: this.users.toPublicUser(user) };
  }
}
