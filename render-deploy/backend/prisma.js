/**
 * Prisma client singleton.
 * Imported everywhere instead of constructing a new client per module.
 */
import { PrismaClient } from '@prisma/client';
import './loadEnv.js';

export const prisma = new PrismaClient();
