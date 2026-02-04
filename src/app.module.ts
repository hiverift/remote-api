import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { SessionsModule } from './sessions/sessions.module';
import { PermissionsModule } from './permissions/permissions.module';
import { UsersModule } from './users/users.module';

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        MongooseModule.forRoot('mongodb+srv://rs5045280:xbpneTRReMJD9LAc@cluster0.sbbouj5.mongodb.net/remote-access'),
        AuthModule,
        SessionsModule,
        PermissionsModule,
        UsersModule,
    ],
})
export class AppModule { }
