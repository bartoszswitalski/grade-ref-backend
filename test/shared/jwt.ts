import { User } from '../../src/entities/user.entity';
import * as jwt from 'jsonwebtoken';

export const getSignedJwt = (user: User) => jwt.sign({ email: user.email, sub: user.id }, process.env.JWT_SECRET);