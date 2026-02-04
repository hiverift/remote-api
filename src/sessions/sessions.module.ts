import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Session, SessionSchema } from './session.schema';
import { Activity, ActivitySchema } from './activity.schema';
import { SessionsGateway } from './sessions.gateway';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Session.name, schema: SessionSchema },
            { name: Activity.name, schema: ActivitySchema }
        ])
    ],
    providers: [SessionsGateway],
})
export class SessionsModule { }
