import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../users/user.schema';

@Injectable()
export class AuthService {
    constructor(
        @InjectModel(User.name) private userModel: Model<User>,
        private jwtService: JwtService,
    ) { }

    async register(email: string, password: string, role: string) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new this.userModel({ email, password: hashedPassword, role });
        return user.save();
    }

    async login(email: string, pass: string) {
        const user = await this.userModel.findOne({ email });
        if (user && (await bcrypt.compare(pass, user.password))) {
            const payload = { email: user.email, sub: user._id, role: user.role };
            return {
                access_token: this.jwtService.sign(payload),
                user: {
                    id: user._id,
                    email: user.email,
                    role: user.role,
                },
            };
        }
        throw new UnauthorizedException('Invalid credentials');
    }
}
