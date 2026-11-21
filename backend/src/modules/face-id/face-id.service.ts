import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FaceStatusDto } from './dto/face-status.dto.js';

@Injectable()
export class FaceIdService {
  private readonly logger = new Logger(FaceIdService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves whether the user has a registered Face ID descriptor.
   * NOTE: The raw faceDescriptor array is intentionally excluded from the return payload
   * to protect sensitive biometric information.
   */
  async getStatus(userId: string): Promise<FaceStatusDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        faceDescriptor: true,
        faceRegisteredAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hasDescriptor =
      Array.isArray(user.faceDescriptor) && user.faceDescriptor.length === 128;

    return {
      registered: hasDescriptor,
    };
  }

  /**
   * Registers or updates a user's 128-float face descriptor.
   * Validates descriptor dimension and numerical sanity.
   */
  async registerFace(
    userId: string,
    descriptor: number[],
  ): Promise<{ success: boolean; message: string; registeredAt: string }> {
    if (
      !Array.isArray(descriptor) ||
      descriptor.length !== 128 ||
      descriptor.some((n) => typeof n !== 'number' || !Number.isFinite(n))
    ) {
      throw new BadRequestException(
        'Face descriptor must be an array of exactly 128 finite numbers',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // TODO: Implement AES-256-GCM encryption at rest for biometric face descriptors
    // using an encryption key from environment variables (e.g. FACE_DESCRIPTOR_SECRET)
    // as a security hardening follow-up before production deployment.

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        faceDescriptor: descriptor,
        faceRegisteredAt: now,
      },
      select: {
        id: true,
      },
    });

    this.logger.log(`Face ID registered successfully for user ${userId}`);

    return {
      success: true,
      message: 'Face ID registered successfully',
      registeredAt: now.toISOString(),
    };
  }

  /**
   * Removes Face ID registration for the authenticated user by clearing the descriptor.
   */
  async removeFace(
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        faceDescriptor: [],
        faceRegisteredAt: null,
      },
      select: {
        id: true,
      },
    });

    this.logger.log(`Face ID removed for user ${userId}`);

    return {
      success: true,
      message: 'Face ID removed successfully',
    };
  }
}
