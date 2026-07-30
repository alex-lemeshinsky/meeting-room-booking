import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthController } from "../auth/auth.controller.js";
import { AuthService } from "../auth/auth.service.js";
import { CsrfGuard } from "../auth/guards/csrf.guard.js";
import { PreAuthMutationGuard } from "../auth/guards/pre-auth-mutation.guard.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { CookieService } from "../auth/session/cookie.service.js";
import { SessionService } from "../auth/session/session.service.js";
import { BookingsController } from "../bookings/bookings.controller.js";
import { BookingsService } from "../bookings/bookings.service.js";
import { MyBookingsController } from "../bookings/my-bookings.controller.js";
import { HealthController } from "../health/health.controller.js";
import { HealthService } from "../health/health.service.js";
import { RoomsController } from "../rooms/rooms.controller.js";
import { RoomsService } from "../rooms/rooms.service.js";

const inertProvider = {};
const allowRequest = { canActivate: () => true };

@Module({
  controllers: [
    HealthController,
    AuthController,
    BookingsController,
    MyBookingsController,
    RoomsController
  ],
  providers: [
    {
      provide: ConfigService,
      useValue: { getOrThrow: () => "http://localhost:3000" }
    },
    { provide: AuthService, useValue: inertProvider },
    { provide: BookingsService, useValue: inertProvider },
    { provide: CookieService, useValue: inertProvider },
    { provide: HealthService, useValue: inertProvider },
    { provide: RoomsService, useValue: inertProvider },
    { provide: SessionService, useValue: inertProvider },
    { provide: CsrfGuard, useValue: allowRequest },
    { provide: PreAuthMutationGuard, useValue: allowRequest },
    { provide: SessionGuard, useValue: allowRequest }
  ]
})
export class OpenApiModule {}
