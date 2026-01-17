import { PipeTransform, Injectable, ArgumentMetadata, BadRequestException } from '@nestjs/common';

@Injectable()
export class ParsePhonePipe implements PipeTransform<string, string> {
    transform(value: string, metadata: ArgumentMetadata): string {
        if (!value) {
            throw new BadRequestException('Phone number is required');
        }

        // Remove all non-digit characters
        const cleaned = value.replace(/\D/g, '');

        // Vietnamese phone number validation (10-11 digits, starts with 0)
        if (!/^0\d{9,10}$/.test(cleaned)) {
            throw new BadRequestException('Invalid phone number format');
        }

        return cleaned;
    }
}
