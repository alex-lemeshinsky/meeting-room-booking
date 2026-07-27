import { Global, Module } from "@nestjs/common";
import { CLOCK, SystemClock } from "@mrb/time";

@Global()
@Module({
  exports: [CLOCK],
  providers: [{ provide: CLOCK, useClass: SystemClock }]
})
export class CommonModule {}
