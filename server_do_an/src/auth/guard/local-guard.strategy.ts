import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  // This guard will use the 'local' strategy defined in passport-local.strategy.ts
  // You can add additional logic here if needed, such as logging or custom error handling
}
