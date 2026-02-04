import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Activity extends Document {
    @Prop({ required: true })
    sessionId: string;

    @Prop({ required: true })
    action: string;

    @Prop()
    details: string;

    @Prop()
    x: number;

    @Prop()
    y: number;

    @Prop({ default: Date.now })
    timestamp: Date;

    @Prop({ type: Types.ObjectId, ref: 'User' })
    userId: Types.ObjectId;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
