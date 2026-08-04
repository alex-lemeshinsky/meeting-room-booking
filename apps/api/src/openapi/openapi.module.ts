import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { AuthController } from "../auth/auth.controller.js";
import { AuthService } from "../auth/auth.service.js";
import { EmailVerificationService } from "../auth/email-verification/email-verification.service.js";
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
import { NotificationSseController } from "../notifications/notification-sse.controller.js";
import { NotificationsController } from "../notifications/notifications.controller.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { RecurrenceController } from "../recurrence/recurrence.controller.js";
import { RecurrenceService } from "../recurrence/recurrence.service.js";
import { RoomsController } from "../rooms/rooms.controller.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { UsersController } from "../users/users.controller.js";
import { UsersService } from "../users/users.service.js";

const inertProvider = {};
const allowRequest = { canActivate: () => true };

@Module({
  controllers: [
    HealthController,
    AuthController,
    BookingsController,
    MyBookingsController,
    RecurrenceController,
    RoomsController,
    NotificationsController,
    NotificationSseController,
    UsersController
  ],
  providers: [
    {
      provide: ConfigService,
      useValue: { getOrThrow: () => "http://localhost:3000" }
    },
    { provide: AuthService, useValue: inertProvider },
    { provide: EmailVerificationService, useValue: inertProvider },
    { provide: BookingsService, useValue: inertProvider },
    { provide: CookieService, useValue: inertProvider },
    { provide: HealthService, useValue: inertProvider },
    { provide: NotificationsService, useValue: inertProvider },
    { provide: EventEmitter2, useValue: inertProvider },
    { provide: RecurrenceService, useValue: inertProvider },
    { provide: RoomsService, useValue: inertProvider },
    { provide: SessionService, useValue: inertProvider },
    { provide: UsersService, useValue: inertProvider },
    { provide: CsrfGuard, useValue: allowRequest },
    { provide: PreAuthMutationGuard, useValue: allowRequest },
    { provide: SessionGuard, useValue: allowRequest }
  ]
})
export class OpenApiModule {}
