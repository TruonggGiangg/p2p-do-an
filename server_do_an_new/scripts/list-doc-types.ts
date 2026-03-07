
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const docTypeModel = app.get<Model<any>>(getModelToken('DocumentType'));

    const docTypes = await docTypeModel.find().lean();
    console.log('--- Document Types ---');
    docTypes.forEach(t => {
        console.log(`Name: ${t.name}, ID: ${t._id} (type: ${typeof t._id}, length: ${t._id.toString().length})`);
    });

    await app.close();
}

bootstrap();
