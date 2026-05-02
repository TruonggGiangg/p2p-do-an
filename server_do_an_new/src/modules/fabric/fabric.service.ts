import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Gateway, Wallets, Network, Contract } from 'fabric-network';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FabricService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FabricService.name);
  private gateway: Gateway;
  private network: Network;
  public contract: Contract;
  private connected = false;
  private channelName = 'mychannel';
  private chaincodeName = 'p2p-lending';

  async onModuleInit() {
    await this.connectToFabric();
  }

  async onModuleDestroy() {
    if (this.gateway) {
      this.gateway.disconnect();
      this.logger.log('Disconnected from Fabric Gateway');
    }
  }

  private async connectToFabric() {
    try {
      // Use process.cwd() to be resilient to dist/ paths
      const ccpPath = path.resolve(process.cwd(), 'fabric-config', 'connection-org1.json');
      
      if (!fs.existsSync(ccpPath)) {
          this.logger.warn(`Connection profile not found at ${ccpPath}`);
          return;
      }
      
      const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

      const walletPath = path.join(process.cwd(), 'fabric-wallet');
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      const identity = await wallet.get('admin');
      if (!identity) {
        this.logger.error('Admin identity not found in wallet');
        return;
      }

      this.gateway = new Gateway();
      await this.gateway.connect(ccp, {
        wallet,
        identity: 'admin',
        discovery: { enabled: true, asLocalhost: true },
      });

      this.network = await this.gateway.getNetwork(this.channelName);
      this.contract = this.network.getContract(this.chaincodeName);
      this.connected = true;

      this.logger.log('Successfully connected to Fabric network and obtained smart contract');
    } catch (error) {
      this.logger.error(`Failed to connect to Fabric network: ${error.message}`, error.stack);
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getNetworkStatus() {
    return {
      connected: this.connected,
      channel: this.channelName,
      chaincode: this.chaincodeName,
      gateway: this.connected ? 'Hyperledger Fabric v2.5' : 'Disconnected',
      organization: 'Org1MSP',
      peer: 'peer0.org1.example.com',
    };
  }

  async submitTransaction(functionName: string, ...args: string[]): Promise<any> {
    try {
      const result = await this.contract.submitTransaction(functionName, ...args);
      return JSON.parse(result.toString());
    } catch (error) {
      this.logger.error(`Failed to submit transaction ${functionName}: ${error.message}`);
      throw error;
    }
  }

  async evaluateTransaction(functionName: string, ...args: string[]): Promise<any> {
    try {
      const result = await this.contract.evaluateTransaction(functionName, ...args);
      return JSON.parse(result.toString());
    } catch (error) {
      this.logger.error(`Failed to evaluate transaction ${functionName}: ${error.message}`);
      throw error;
    }
  }
}
