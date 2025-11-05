import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Wallets, Gateway, Network, Contract } from 'fabric-network';
import * as fs from 'fs';
import * as path from 'path';

export interface FabricConnectionConfig {
  channelName?: string;
  chaincodeName?: string;
  identity?: string;
  walletPath?: string;
  connectionPath?: string;
}

@Injectable()
export class FabricService implements OnModuleInit {
  private readonly logger = new Logger(FabricService.name);
  private gateway: Gateway | null = null;
  private network: Network | null = null;
  private contract: Contract | null = null;
  private isConnecting = false;
  private isConnected = false;

  // Default config
  private readonly defaultChannelName = 'mychannel';
  private readonly defaultChaincodeName = 'p2plending';
  private readonly defaultIdentity = 'admin';
  private readonly defaultWalletPath = path.join(process.cwd(), 'wallet');

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    // Không tự động connect, để các module tự quyết định khi nào cần connect
    // Có thể uncomment nếu muốn tự động connect khi app start
    // await this.ensureConnection();
  }

  /**
   * Đảm bảo connection đã được thiết lập
   * Thread-safe: chỉ connect 1 lần, các request khác sẽ đợi
   */
  async ensureConnection(config?: FabricConnectionConfig): Promise<void> {
    if (this.isConnected && this.contract) {
      return;
    }

    if (this.isConnecting) {
      // Đợi connection đang được thiết lập
      while (this.isConnecting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (this.isConnected && this.contract) {
        return;
      }
    }

    this.isConnecting = true;
    try {
      await this.connect(config);
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Connect vào Hyperledger Fabric network
   */
  private async connect(config?: FabricConnectionConfig): Promise<void> {
    try {
      this.logger.log('Connecting to Hyperledger Fabric...');

      // Load network configuration
      const connectionPath = this.getConnectionPath(config?.connectionPath);
      const ccp = JSON.parse(fs.readFileSync(connectionPath, 'utf8'));

      // Create wallet
      const walletPath = config?.walletPath || this.defaultWalletPath;
      this.logger.log(`Using wallet at: ${walletPath}`);
      const wallet = await Wallets.newFileSystemWallet(walletPath);

      // Check identity
      const identity = config?.identity || this.defaultIdentity;
      const identityExists = await wallet.get(identity);
      if (!identityExists) {
        throw new Error(
          `Identity "${identity}" not found in wallet. Please enroll identity first.`,
        );
      }

      // Create gateway
      this.gateway = new Gateway();
      await this.gateway.connect(ccp, {
        wallet,
        identity,
        discovery: {
          enabled: true,
          asLocalhost: true,
        },
      });

      // Get network
      const channelName = config?.channelName || this.defaultChannelName;
      this.network = await this.gateway.getNetwork(channelName);

      // Get contract (nếu có chaincodeName)
      if (config?.chaincodeName) {
        this.contract = this.network.getContract(config.chaincodeName);
      } else {
        // Lấy contract mặc định
        const chaincodeName = this.defaultChaincodeName;
        this.contract = this.network.getContract(chaincodeName);
      }

      this.isConnected = true;
      this.logger.log(
        `Successfully connected to Hyperledger Fabric (channel: ${channelName}, chaincode: ${config?.chaincodeName || this.defaultChaincodeName})`,
      );
    } catch (error) {
      this.logger.error(`Failed to connect to Fabric network: ${error}`);
      this.isConnected = false;
      throw new Error(
        `Cannot connect to Hyperledger Fabric: ${error.message}. Blockchain is required.`,
      );
    }
  }

  /**
   * Lấy connection path, ưu tiên config/connection.json
   */
  private getConnectionPath(customPath?: string): string {
    if (customPath && fs.existsSync(customPath)) {
      this.logger.log(`Using custom connection path: ${customPath}`);
      return customPath;
    }

    // Ưu tiên: config/connection.json
    let ccpPath = path.resolve(process.cwd(), 'config/connection.json');

    // Nếu không có, thử đọc từ organizations folder (fallback)
    if (!fs.existsSync(ccpPath)) {
      const org1ConnectionPath = path.resolve(
        process.cwd(),
        'organizations/peerOrganizations/org1.example.com/connection-org1.json',
      );
      if (fs.existsSync(org1ConnectionPath)) {
        ccpPath = org1ConnectionPath;
        this.logger.log(
          `Using connection.json from organizations folder: ${ccpPath}`,
        );
      } else {
        throw new Error(
          `Hyperledger Fabric config not found. Tried:
          - ${ccpPath}
          - ${org1ConnectionPath}
          Please ensure connection.json exists in config/ folder or run ccp-generate.sh script.`,
        );
      }
    } else {
      this.logger.log(`Using connection.json from config folder: ${ccpPath}`);
    }

    return ccpPath;
  }

  /**
   * Lấy Gateway instance
   * Phải gọi ensureConnection() trước
   */
  getGateway(): Gateway {
    if (!this.gateway) {
      throw new Error(
        'Gateway not connected. Call ensureConnection() first.',
      );
    }
    return this.gateway;
  }

  /**
   * Lấy Network instance
   * Phải gọi ensureConnection() trước
   */
  getNetwork(): Network {
    if (!this.network) {
      throw new Error(
        'Network not connected. Call ensureConnection() first.',
      );
    }
    return this.network;
  }

  /**
   * Lấy Contract instance
   * Phải gọi ensureConnection() trước
   */
  getContract(chaincodeName?: string): Contract {
    if (!this.contract && !chaincodeName) {
      throw new Error(
        'Contract not connected. Call ensureConnection() first or provide chaincodeName.',
      );
    }

    if (chaincodeName && this.network) {
      // Lấy contract với chaincode name khác
      return this.network.getContract(chaincodeName);
    }

    return this.contract!;
  }

  /**
   * Lấy contract với chaincode name cụ thể
   * Phải gọi ensureConnection() trước
   */
  async getContractByName(
    chaincodeName: string,
    config?: FabricConnectionConfig,
  ): Promise<Contract> {
    await this.ensureConnection(config);

    if (!this.network) {
      throw new Error('Network not connected. Call ensureConnection() first.');
    }

    return this.network.getContract(chaincodeName);
  }

  /**
   * Disconnect từ Hyperledger Fabric network
   */
  async disconnect(): Promise<void> {
    if (this.gateway) {
      await this.gateway.disconnect();
      this.gateway = null;
      this.network = null;
      this.contract = null;
      this.isConnected = false;
      this.logger.log('Disconnected from Hyperledger Fabric');
    }
  }

  /**
   * Kiểm tra xem đã connect chưa
   */
  isConnectedToFabric(): boolean {
    return this.isConnected && this.contract !== null;
  }

  /**
   * Reset connection (dùng khi cần reconnect)
   */
  async resetConnection(): Promise<void> {
    await this.disconnect();
    this.isConnected = false;
    this.isConnecting = false;
  }
}

