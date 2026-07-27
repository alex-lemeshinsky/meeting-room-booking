import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { AuthService } from "./auth.service.js";
import { AuthResponseDto } from "./dto/auth-response.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import { PreAuthMutationGuard } from "./guards/pre-auth-mutation.guard.js";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("register")
  @HttpCode(201)
  @UseGuards(PreAuthMutationGuard)
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({ type: AuthResponseDto })
  register(@Body() input: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(input);
  }
}
