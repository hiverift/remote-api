import { Controller, Get, Param, Delete } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Session } from './session.schema';
import { Activity } from './activity.schema';

@Controller('sessions')
export class SessionsController {
    constructor(
        @InjectModel(Session.name) private sessionModel: Model<Session>,
        @InjectModel(Activity.name) private activityModel: Model<Activity>
    ) { }

    @Get()
    async findAll() {
        return this.sessionModel.find().exec();
    }

    @Get(':sessionId')
    async findOne(@Param('sessionId') sessionId: string) {
        return this.sessionModel.findOne({ sessionId }).exec();
    }

    @Get(':sessionId/activities')
    async findActivities(@Param('sessionId') sessionId: string) {
        return this.activityModel.find({ sessionId }).sort({ timestamp: -1 }).exec();
    }

    @Delete(':sessionId')
    async remove(@Param('sessionId') sessionId: string) {
        return this.sessionModel.deleteOne({ sessionId }).exec();
    }
}
