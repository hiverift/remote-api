import { Controller, Get, Post, Body, Delete, Param, Put, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';
import * as bcrypt from 'bcrypt';

@Controller('users')
export class UsersController {
    constructor(@InjectModel(User.name) private userModel: Model<User>) { }

    @Get()
    async findAll() {
        return this.userModel.find({}, { password: 0 }).exec();
    }

    @Post()
    async create(@Body() userData: any) {
        const hashedPassword = await bcrypt.hash(userData.password || 'password123', 10);
        const user = new this.userModel({
            ...userData,
            password: hashedPassword,
        });
        return user.save();
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        return this.userModel.findByIdAndDelete(id).exec();
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() userData: any) {
        if (userData.password) {
            userData.password = await bcrypt.hash(userData.password, 10);
        }
        return this.userModel.findByIdAndUpdate(id, userData, { new: true }).exec();
    }
}
