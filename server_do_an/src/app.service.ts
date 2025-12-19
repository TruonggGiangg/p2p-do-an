import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'P2P Lending API - Keycloak Auth';
  }
}
