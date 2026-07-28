import { MODULE_METADATA } from "@nestjs/common/constants.js";
import { describe, expect, it } from "vitest";
import { AuthModule } from "../../src/auth/auth.module.js";
import { AppModule } from "../../src/app.module.js";
import { RoomsController } from "../../src/rooms/rooms.controller.js";
import { RoomsModule } from "../../src/rooms/rooms.module.js";
import { RoomsService } from "../../src/rooms/rooms.service.js";

describe("RoomsModule boundary", () => {
  it("keeps authentication at the application composition root", () => {
    const roomImports =
      (Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        RoomsModule
      ) as unknown[]) ?? [];
    const roomControllers =
      (Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        RoomsModule
      ) as unknown[]) ?? [];
    const roomExports =
      (Reflect.getMetadata(
        MODULE_METADATA.EXPORTS,
        RoomsModule
      ) as unknown[]) ?? [];
    const appControllers =
      (Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        AppModule
      ) as unknown[]) ?? [];
    const appImports =
      (Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[]) ??
      [];

    expect(roomImports).not.toContain(AuthModule);
    expect(roomControllers).not.toContain(RoomsController);
    expect(roomExports).toContain(RoomsService);
    expect(appImports).toEqual(
      expect.arrayContaining([AuthModule, RoomsModule])
    );
    expect(appControllers).toContain(RoomsController);
  });
});
