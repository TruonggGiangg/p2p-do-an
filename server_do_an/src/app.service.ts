import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { UsersService } from '@users/users.service';
import { ConfigService } from '@nestjs/config';
import { Role } from '@auth/roles/role.enum';

@Injectable()
export class AppService implements OnApplicationBootstrap {
  constructor(
    private readonly usersService: UsersService,
    private readonly configService: ConfigService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async onApplicationBootstrap() {
    const email = this.configService.get<string>('ADMIN_EMAIL') || 'admin@p2p.local';
    const password = this.configService.get<string>('ADMIN_PASSWORD') || 'Admin@123456';
    const name = this.configService.get<string>('ADMIN_NAME') || 'System Administrator';

    const existing = await this.usersService.findOneByEmail(email);
    if (existing) return;

    await this.usersService.register({
      name,
      email,
      password,
      age: 0,
      gender: 'unknown',
      address: 'N/A',
      role: Role.ADMIN,
    } as any);
  }
}
