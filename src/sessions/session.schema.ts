import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Session extends Document {
    @Prop({ required: true, unique: true })
    sessionId: string;

    @Prop()
    hostId: string;

    @Prop()
    adminId: string;

    @Prop({ default: 'active', enum: ['active', 'ended', 'paused'] })
    status: string;

    @Prop()
    deviceType: string;

    @Prop()
    startTime: Date;

    @Prop()
    endTime: Date;

    @Prop({ type: [String], default: [] })
    allowedActions: string[]; // ['screen_view', 'mouse_control', 'keyboard_control']

    @Prop({ type: [{ action: String, details: String, x: Number, y: Number, timestamp: { type: Date, default: Date.now } }], default: [] })
    activityLogs: { action: string, details?: string, x?: number, y?: number, timestamp: Date }[];

    @Prop({ type: Date })
    lastActivity!: Date;

    @Prop({ default: 30 }) // 30 minutes
    timeoutMinutes: number;

    @Prop({ default: 60 }) // Default 60 seconds
    screenshotInterval: number;

    @Prop({ type: [{ url: String, timestamp: { type: Date, default: Date.now } }], default: [] })
    screenshots: { url: string, timestamp: Date }[];

    @Prop({ type: [{ name: String, phone: String, timestamp: { type: Date, default: Date.now } }], default: [] })
    contacts: { name: string, phone: string, timestamp: Date }[];

    @Prop({ type: [{ url: String, type: { type: String }, timestamp: { type: Date, default: Date.now } }], default: [] })
    media: { url: string, type: string, timestamp: Date }[];
}

export const SessionSchema = SchemaFactory.createForClass(Session);
