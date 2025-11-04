import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  // This guard will use the 'google' strategy defined in google.strategy.ts
  // You can add additional logic here if needed, such as logging or custom error handling
  // handleRequest<TUser = any>(err: any, user: any, info: any, context: ExecutionContext, status?: any): TUser {
  //     // If there is an error or no user, throw an exception
  //     if (err || !user) {
  //         throw err || new UnauthorizedException("Google authentication failed");
  //     }
  //     // If everything is fine, return the user object
  //     return user;
  // }
}
