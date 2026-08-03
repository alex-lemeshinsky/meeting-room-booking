import { CLOCK, type Clock } from "@mrb/time";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Interval } from "@nestjs/schedule";
import { DatabaseService } from "../database/database.service.js";

export interface NotificationCreatedEvent {
  userId: string;
  notificationId: string;
}

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);
  private readonly notifyBeforeMinutes: number;

  constructor(
    private readonly database: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock
  ) {
    this.notifyBeforeMinutes = Number(
      this.configService.get<string>("NOTIFY_BEFORE_MINUTES", "10")
    );
  }

  @Interval(15_000)
  async processNotifications(): Promise<number> {
    const now = this.clock.now();
    let createdCount = 0;

    await this.database.$transaction(async (tx) => {
      const lockResult = await tx.$queryRaw<Array<{ acquired: boolean }>>`
        SELECT pg_try_advisory_xact_lock(hashtext('mrb_notification_scheduler')) AS acquired
      `;

      if (!lockResult[0]?.acquired) {
        return;
      }

      const candidates = await tx.$queryRaw<
        Array<{
          current_booking_id: string;
          user_id: string;
          current_title: string;
          end_at: Date;
          next_booking_id: string;
          next_title: string;
          next_start_at: Date;
          room_name: string;
        }>
      >`
        SELECT
          current_b.id AS current_booking_id,
          current_b.user_id,
          current_b.title AS current_title,
          current_b.end_at,
          next_b.id AS next_booking_id,
          next_b.title AS next_title,
          next_b.start_at AS next_start_at,
          r.name AS room_name
        FROM bookings current_b
        JOIN bookings next_b
          ON next_b.room_id = current_b.room_id
          AND next_b.start_at = current_b.end_at
          AND next_b.status = 'ACTIVE'
        JOIN rooms r ON r.id = current_b.room_id
        LEFT JOIN notifications n
          ON n.type = 'NEXT_BOOKING_STARTS'
          AND n.current_booking_id = current_b.id
          AND n.next_booking_id = next_b.id
        WHERE current_b.status = 'ACTIVE'
          AND current_b.end_at - make_interval(mins => ${this.notifyBeforeMinutes}) <= ${now}
          AND current_b.end_at > ${now}
          AND n.id IS NULL
      `;

      for (const candidate of candidates) {
        const message = `«${candidate.current_title}» у ${candidate.room_name} завершується за ${this.notifyBeforeMinutes} хв — наступне бронювання починається одразу`;

        const inserted = await tx.$queryRaw<Array<{ id: string; user_id: string }>>`
          INSERT INTO notifications (user_id, current_booking_id, next_booking_id, type, message, room_name, scheduled_for)
          VALUES (
            ${candidate.user_id}::uuid,
            ${candidate.current_booking_id}::uuid,
            ${candidate.next_booking_id}::uuid,
            'NEXT_BOOKING_STARTS',
            ${message},
            ${candidate.room_name},
            ${candidate.end_at}
          )
          ON CONFLICT (type, current_booking_id, next_booking_id) DO NOTHING
          RETURNING id, user_id
        `;

        const insertedRow = inserted[0];
        if (insertedRow) {
          createdCount++;
          this.eventEmitter.emit("notification.created", {
            userId: insertedRow.user_id,
            notificationId: insertedRow.id
          } satisfies NotificationCreatedEvent);
        }
      }
    });

    return createdCount;
  }
}
