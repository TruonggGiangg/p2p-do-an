import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * LocalAuthGuard uses Passport's Local strategy to validate credentials.
 * It extracts identifier and password from request body (via LocalStrategy),
 * calls validate(), and attaches the user to req.user if valid.
 * If invalid, it throws UnauthorizedException automatically.
 */
@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}