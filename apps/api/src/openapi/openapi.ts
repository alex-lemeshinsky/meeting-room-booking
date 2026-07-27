import type { INestApplication } from "@nestjs/common";
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject
} from "@nestjs/swagger";

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle("Meeting Room Booking API")
    .setVersion("1.0")
    .addCookieAuth("mrb_session", {
      type: "apiKey",
      in: "cookie",
      name: "mrb_session"
    })
    .build();

  return SwaggerModule.createDocument(app, config);
}
