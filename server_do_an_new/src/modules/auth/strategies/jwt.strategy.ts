import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserPayload } from '../interfaces/auth.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private configService: ConfigService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('JWT_SECRET') || 'default-secret',
        });
    }

    async validate(payload: any): Promise<UserPayload> {
        return {
            _id: payload._id,
            email: payload.email,
            name: payload.name,
            username: payload.username,
            roles: payload.roles,
            keycloakUserId: payload.keycloakUserId,
            fineractClientId: payload.fineractClientId,
        };
    }
}
