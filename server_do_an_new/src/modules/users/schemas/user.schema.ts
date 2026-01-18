import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserStatus {
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    SUSPENDED = 'suspended',
}

@Schema({ timestamps: true, collection: 'users' })
export class User extends Document {
    @Prop({ required: true, unique: true, index: true })
    keycloakId: string;

    @Prop({ required: false, index: true })
    fineractClientId: string;

    @Prop({ required: true, unique: true, index: true })
    username: string; // Phone number

    @Prop({ required: false })
    email: string;

    @Prop({
        type: {
            firstName: { type: String },
            lastName: { type: String },
            avatar: { type: String },
        },
        _id: false,
    })
    profile: {
        firstName: string;
        lastName: string;
        avatar?: string;
    };

    @Prop({
        type: String,
        enum: UserStatus,
        default: UserStatus.ACTIVE,
    })
    status: UserStatus;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, any>;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Ensure indexes
UserSchema.index({ keycloakId: 1 }, { unique: true });
UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ fineractClientId: 1 });
