import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB — generous for scanned receipts/bills/PDFs
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'text/csv',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];

@Injectable()
export class AttachmentsService {
  private s3: S3Client;

  constructor(private prisma: PrismaService) {
    // Works against AWS S3, DigitalOcean Spaces, or self-hosted MinIO by pointing endpoint at any of them.
    this.s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'auto',
      forcePathStyle: !!process.env.S3_ENDPOINT, // required for MinIO/most non-AWS S3-compatible endpoints
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async upload(
    user: AuthenticatedUser,
    activityDataId: string,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    if (file.size > MAX_FILE_SIZE_BYTES) throw new BadRequestException('File exceeds the 15MB limit.');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    const activity = await this.prisma.activityData.findFirst({
      where: { id: activityDataId, organizationId: user.organizationId },
    });
    if (!activity) throw new NotFoundException('Activity data row not found.');
    if (user.restrictedFacilityId && activity.facilityId !== user.restrictedFacilityId) {
      throw new BadRequestException('You do not have access to this facility.');
    }

    const key = `${user.organizationId}/${activityDataId}/${randomUUID()}-${file.originalname}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const fileUrl = process.env.S3_PUBLIC_URL_BASE
      ? `${process.env.S3_PUBLIC_URL_BASE}/${key}`
      : key; // fall back to storing the raw object key if no public base URL is configured (private bucket + signed-URL read pattern)

    return this.prisma.attachment.create({
      data: {
        activityDataId,
        fileName: file.originalname,
        fileUrl,
        fileType: file.mimetype,
        fileSizeBytes: BigInt(file.size),
        uploadedBy: user.id,
      },
    });
  }

  list(user: AuthenticatedUser, activityDataId: string) {
    return this.prisma.attachment.findMany({
      where: { activityDataId, activityData: { organizationId: user.organizationId } },
      orderBy: { uploadedAt: 'desc' },
    });
  }
}
