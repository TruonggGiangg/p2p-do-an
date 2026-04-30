const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { ContractService } = require('../dist/modules/loan/contract.service');
const { FabricService } = require('../dist/modules/fabric/fabric.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const contractService = app.get(ContractService);
  const fabricService = app.get(FabricService);

  const contractId = 'P2P-LC-MOLTSGJT-2BB265C0';
  const contract = await contractService['contractModel'].findOne({ contractId }).exec();
  
  if (contract) {
    try {
      const dataToSave = JSON.stringify(contract.toJSON());
      await fabricService.submitTransaction('createLoanContract', contractId, dataToSave);
      console.log('Successfully synced contract ' + contractId + ' to blockchain');
    } catch (e) {
      console.error('Failed to sync:', e.message);
    }
  } else {
    console.log('Contract not found');
  }
  
  await app.close();
}
bootstrap();
