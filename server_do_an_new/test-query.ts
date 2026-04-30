import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { InvestmentOrder } from './src/modules/invest/schemas/investment-order.schema';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const orderModel = app.get(getModelToken(InvestmentOrder.name));
  try {
    const filter = {
      $expr: { $gte: [{ $ifNull: ['$matchedNodes', 0] }, { $ifNull: ['$totalNodes', 1] }] }
    };
    const c = await orderModel.countDocuments(filter);
    console.log('Count matched:', c);
    
    const filter2 = {
      status: 'open',
      $expr: { $lt: [{ $ifNull: ['$matchedNodes', 0] }, { $ifNull: ['$totalNodes', 1] }] }
    };
    const c2 = await orderModel.countDocuments(filter2);
    console.log('Count open:', c2);
  } catch (e) {
    console.error('Mongo Error:', e.message);
  }
  process.exit(0);
}
run();
