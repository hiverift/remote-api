import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Permission extends Document {
    @Prop({ required: true, unique: true })
    name: string; // e.g., 'contacts', 'media', 'keyboard'

    @Prop({ required: true })
    description: string;

    @Prop({ default: true })
    isActive: boolean;

    @Prop({ type: [String], default: [] })
    requiredRoles: string[];
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
