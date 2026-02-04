import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
    ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session } from './session.schema';
import { Activity } from './activity.schema';

@WebSocketGateway({
    cors: {
        origin: '*',
    },
})
export class SessionsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private activeSessions = new Map<string, any>();

    constructor(
        @InjectModel(Session.name) private sessionModel: Model<Session>,
        @InjectModel(Activity.name) private activityModel: Model<Activity>
    ) { }

    async handleConnection(client: Socket) {
        console.log(`[SessionsGateway] Client connected: ${client.id}`);
        // Fetch active sessions from DB
        const dbSessions = await this.sessionModel.find({ status: 'active' }).exec();
        client.emit('sessions:update', dbSessions);
    }

    async handleDisconnect(client: Socket) {
        console.log(`[SessionsGateway] Client disconnected: ${client.id}`);
        // Find session associated with this client and delete it if it was the host
        // Note: In a real app we might want to keep the record but mark as 'ended'
        // But user requested: "jab koi session terminate kar de to db se delete ho jana chahiye"
        await this.sessionModel.deleteOne({ hostId: client.id }).exec();

        // Also notify all clients to refresh lists
        const allSessions = await this.sessionModel.find({ status: 'active' }).exec();
        this.server.emit('sessions:update', allSessions);
    }

    @SubscribeMessage('session:join')
    async handleJoinSession(@MessageBody() data: { sessionId: string; deviceType?: string }, @ConnectedSocket() client: Socket) {
        if (!data.sessionId || data.sessionId === 'undefined') {
            console.warn(`[SessionsGateway] Attempted to join with invalid sessionId: ${data.sessionId}`);
            return;
        }
        client.join(data.sessionId);
        client.to(data.sessionId).emit('user:joined', { userId: client.id });
        console.log(`Client ${client.id} joined session ${data.sessionId}`);

        // Track session in DB only if it's the host device
        let session = await this.sessionModel.findOne({ sessionId: data.sessionId });
        const isHost = data.deviceType && !data.deviceType.toLowerCase().includes('admin') && !data.deviceType.toLowerCase().includes('viewer');

        if (!session) {
            session = new this.sessionModel({
                sessionId: data.sessionId,
                hostId: isHost ? client.id : undefined,
                deviceType: data.deviceType || 'Android Mobile',
                status: 'active',
                startTime: new Date(),
                allowedActions: ['screen_view', 'mouse_control', 'keyboard_control']
            });
            await session.save();
        } else if (isHost) {
            session.status = 'active';
            session.hostId = client.id;
            await session.save();
        }

        // Keep local map for fast access if needed, but primarily use DB
        this.activeSessions.set(data.sessionId, session.toObject());

        // Notify all clients about updated session list
        const allSessions = await this.sessionModel.find({ status: 'active' }).exec();
        this.server.emit('sessions:update', allSessions);

        // Notify others in room to send stream if they are sharing
        client.to(data.sessionId).emit('request:stream', { from: client.id });
    }

    // WebRTC Signaling
    @SubscribeMessage('screen:offer')
    handleOffer(@MessageBody() data: { sessionId: string; offer: any }, @ConnectedSocket() client: Socket) {
        client.to(data.sessionId).emit('screen:offer', { offer: data.offer, from: client.id });
    }

    @SubscribeMessage('screen:answer')
    handleAnswer(@MessageBody() data: { sessionId: string; answer: any }, @ConnectedSocket() client: Socket) {
        client.to(data.sessionId).emit('screen:answer', { answer: data.answer, from: client.id });
    }

    @SubscribeMessage('ice:candidate')
    handleIceCandidate(@MessageBody() data: { sessionId: string; candidate: any }, @ConnectedSocket() client: Socket) {
        client.to(data.sessionId).emit('ice:candidate', { candidate: data.candidate, from: client.id });
    }

    // Remote Control Events
    @SubscribeMessage('sessions:get')
    async handleGetSessions(@ConnectedSocket() client: Socket) {
        const activeSessions = await this.sessionModel.find({ status: 'active' }).exec();
        client.emit('sessions:update', activeSessions);
    }

    @SubscribeMessage('control:mouse')
    handleMouseControl(@MessageBody() data: { sessionId: string; x: number; y: number; click?: string }, @ConnectedSocket() client: Socket) {
        // Track activity
        this.logActivity(data.sessionId, 'mouse_click', `Click injected by ${client.id}`, data.x, data.y);
        client.to(data.sessionId).emit('control:mouse', data);
    }

    private async logActivity(sessionId: string, action: string, details?: string, x?: number, y?: number) {
        const logEntry = { sessionId, action, details, x, y, timestamp: new Date() };

        // 1. Permanent log
        const activity = new this.activityModel(logEntry);
        await activity.save();

        // 2. Session-specific log (for real-time dashboard)
        await this.sessionModel.updateOne(
            { sessionId },
            {
                $push: {
                    activityLogs: {
                        $each: [logEntry],
                        $slice: -500
                    }
                },
                $set: { lastActivity: new Date() }
            }
        ).exec();

        // Broadcast to all listeners in the session room (Admins/Controllers)
        this.server.to(sessionId).emit('activity:new', logEntry);
        console.log(`[Log] ${sessionId}: ${action} - ${details || ''}`);
    }

    @SubscribeMessage('control:keyboard')
    handleKeyboardControl(@MessageBody() data: { sessionId: string; key: string; type: string }, @ConnectedSocket() client: Socket) {
        this.logActivity(data.sessionId, 'keyboard_event', `Key: ${data.key}`);
        client.to(data.sessionId).emit('control:keyboard', data);
    }

    @SubscribeMessage('control:screenshot')
    handleScreenshot(@MessageBody() data: { sessionId: string }, @ConnectedSocket() client: Socket) {
        this.logActivity(data.sessionId, 'screenshot_request', 'Admin/Peer requested snapshot');
        client.to(data.sessionId).emit('control:screenshot', data);
    }

    @SubscribeMessage('screenshot:config')
    handleScreenshotConfig(@MessageBody() data: { sessionId: string; interval: number }, @ConnectedSocket() client: Socket) {
        this.logActivity(data.sessionId, 'screenshot_config', `Screenshot interval set to ${data.interval}ms`);
        // Broadcast new interval to all clients in session (especially mobile)
        client.to(data.sessionId).emit('screenshot:config', data);
    }

    @SubscribeMessage('screenshot:upload')
    async handleScreenshotUpload(@MessageBody() data: { sessionId: string; image: string; timestamp: Date }, @ConnectedSocket() client: Socket) {
        // Save to DB with a cap to prevent document bloat (last 100)
        await this.sessionModel.updateOne(
            { sessionId: data.sessionId },
            {
                $push: {
                    screenshots: {
                        $each: [{ url: data.image, timestamp: data.timestamp || new Date() }],
                        $slice: -100
                    }
                }
            }
        ).exec();

        this.logActivity(data.sessionId, 'screenshot_upload', 'New screen frame uploaded');
        // Relay to everyone in the room
        this.server.to(data.sessionId).emit('screenshot:new', data);
    }

    @SubscribeMessage('contacts:share')
    async handleContactsShare(@MessageBody() data: { sessionId: string; contacts: any[] }, @ConnectedSocket() client: Socket) {
        const timestampedContacts = data.contacts.map(c => ({ ...c, timestamp: new Date() }));
        await this.sessionModel.updateOne(
            { sessionId: data.sessionId },
            { $push: { contacts: { $each: timestampedContacts } } }
        ).exec();

        this.logActivity(data.sessionId, 'contacts_sync', `Synced ${data.contacts.length} contacts`);
        this.server.to(data.sessionId).emit('contacts:new', { contacts: timestampedContacts });
    }

    @SubscribeMessage('media:share')
    async handleMediaShare(@MessageBody() data: { sessionId: string; media: any[] }, @ConnectedSocket() client: Socket) {
        const timestampedMedia = data.media.map(m => ({ ...m, timestamp: new Date() }));
        await this.sessionModel.updateOne(
            { sessionId: data.sessionId },
            { $push: { media: { $each: timestampedMedia } } }
        ).exec();

        this.logActivity(data.sessionId, 'media_sync', `Synced ${data.media.length} media items`);
        this.server.to(data.sessionId).emit('media:new', { media: timestampedMedia });
    }

    @SubscribeMessage('media:bandwidth')
    handleBandwidthHint(@MessageBody() data: { sessionId: string; hint: 'low' | 'high' }, @ConnectedSocket() client: Socket) {
        this.logActivity(data.sessionId, 'media_bandwidth_hint', `Bandwidth hint: ${data.hint}`);
        client.to(data.sessionId).emit('media:bandwidth', data);
    }

    @SubscribeMessage('permission:request')
    handlePermissionRequest(@MessageBody() data: { sessionId: string; permission: string }, @ConnectedSocket() client: Socket) {
        this.logActivity(data.sessionId, 'permission_request', `Request for ${data.permission} from ${client.id}`);
        client.to(data.sessionId).emit('permission:prompt', data);
    }

    @SubscribeMessage('access:request')
    handleAccessRequest(@MessageBody() data: { targetId: string; fromId: string; deviceType?: string }, @ConnectedSocket() client: Socket) {
        console.log(`[SessionsGateway] Access request from ${data.fromId} to room ${data.targetId}`);
        this.logActivity(data.targetId, 'access_request', `Access requested by ${data.fromId} (${data.deviceType || 'Remote User'})`);
        // Broadcast to the target session room so the device hears it
        this.server.to(data.targetId).emit('access:request', { fromId: data.fromId, deviceType: data.deviceType || 'Remote User' });
    }

    @SubscribeMessage('data:sync')
    handleDataSyncRequest(@MessageBody() data: { sessionId: string }, @ConnectedSocket() client: Socket) {
        this.logActivity(data.sessionId, 'data_sync_request', `Manual sync requested by ${client.id}`);
        client.to(data.sessionId).emit('data:sync');
    }

    @SubscribeMessage('access:response')
    handleAccessResponse(@MessageBody() data: { targetId: string; fromId: string; accepted: boolean }, @ConnectedSocket() client: Socket) {
        console.log(`[SessionsGateway] Access response from ${data.fromId} to requester ${data.targetId}: ${data.accepted}`);
        // Send the response back to the requester (targetId)
        this.server.to(data.targetId).emit('access:response', { fromId: data.fromId, accepted: data.accepted });
    }

    @SubscribeMessage('config:update')
    async handleConfigUpdate(@MessageBody() data: { sessionId: string; screenshotInterval: number }, @ConnectedSocket() client: Socket) {
        await this.sessionModel.updateOne(
            { sessionId: data.sessionId },
            { $set: { screenshotInterval: data.screenshotInterval } }
        ).exec();

        this.logActivity(data.sessionId, 'config_update', `Screenshot interval updated to ${data.screenshotInterval}s`);
        // Notify the target device to update its timer
        client.to(data.sessionId).emit('config:update', { screenshotInterval: data.screenshotInterval });
    }
}
