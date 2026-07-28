import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger";
import { ApiErrorDto } from "../common/http/api-error.dto.js";
import type { Response } from "express";
import { AuthService } from "./auth.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";
import { AuthResponseDto } from "./dto/auth-response.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import { CsrfGuard } from "./guards/csrf.guard.js";
import { PreAuthMutationGuard } from "./guards/pre-auth-mutation.guard.js";
import { SessionGuard } from "./guards/session.guard.js";
import { CookieService } from "./session/cookie.service.js";
import { SessionService } from "./session/session.service.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CookieService) private readonly cookies: CookieService,
    @Inject(SessionService) private readonly sessions: SessionService
  ) {}

  @Post("register")
  @HttpCode(201)
  @UseGuards(PreAuthMutationGuard)
  @ApiOperation({ operationId: "register" })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 409, type: ApiErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  register(@Body() input: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(input);
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(PreAuthMutationGuard)
  @ApiOperation({ operationId: "login" })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<AuthResponseDto> {
    const result = await this.auth.login(input);
    this.cookies.setSessionCookies(
      response,
      result.session,
      result.session.absoluteExpiresAt
    );
    return { user: result.user };
  }

  @Get("session")
  @UseGuards(SessionGuard)
  @ApiOperation({ operationId: "getSession" })
  @ApiCookieAuth()
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  session(@Req() request: AuthenticatedRequest): AuthResponseDto {
    return { user: request.auth.user };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionGuard, CsrfGuard)
  @ApiOperation({ operationId: "logout" })
  @ApiCookieAuth()
  @ApiHeader({
    name: "X-CSRF-Token",
    required: true,
    schema: { type: "string" }
  })
  @ApiNoContentResponse()
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  @ApiResponse({ status: 415, type: ApiErrorDto })
  @ApiResponse({ status: 500, type: ApiErrorDto })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    await this.sessions.revoke(request.auth.session.id);
    this.cookies.clearSessionCookies(response);
  }
}
