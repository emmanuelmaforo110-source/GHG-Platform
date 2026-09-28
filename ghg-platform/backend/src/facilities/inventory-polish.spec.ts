import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FacilitiesService } from './facilities.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { attachmentKey, safeFileName } from '../attachments/attachment-key';
import { ReportingPeriodsService } from '../reporting-periods/reporting-periods.service';
import '../common/bigint-json';
import { base, CAT, FACILITY, makeService, ORG, PERIOD, seed, user } from '../activity-data/testing/workbook-fixture';

const other = { ...user, id: 'user-2' };

describe('Facilities', () => {
  it('adds, renames and deactivates facilities, refusing duplicate names', async () => {
    const prisma = seed();
    const service = new FacilitiesService(prisma as any);
    const arusha = await service.create(user, { name: '  Arusha branch ', country: 'Tanzania', address: ' ' });
    expect(arusha).toMatchObject({ name: 'Arusha branch', country: 'Tanzania', address: null });
    await expect(service.create(user, { name: 'dar es salaam office' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(user, arusha.id, { name: 'Dar es Salaam Office' })).rejects.toBeInstanceOf(BadRequestException);

    await service.update(user, arusha.id, { name: 'Arusha office', isActive: false });
    expect((await service.list(user)).map((f: any) => f.name)).toEqual(['Dar es Salaam Office']);
    const all = await service.list(user, true);
    expect(all.map((f: any) => [f.name, f.isActive])).toEqual([['Arusha office', false], ['Dar es Salaam Office', true]]);
  });

  it('counts entries per facility and blocks new entries on an inactive facility', async () => {
    const prisma = seed();
    const data = makeService(prisma);
    await data.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'Generator', fuelOrMaterialType: 'Diesel', quantity: 100, unit: 'litres' }, { } as any);
    const service = new FacilitiesService(prisma as any);
    const [dar] = await service.list(user, true);
    expect((dar as any).entryCount > 0).toBe(true);

    await service.update(user, FACILITY, { isActive: false });
    await expect(
      data.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'Generator 2', fuelOrMaterialType: 'Diesel', quantity: 5, unit: 'litres' }, {} as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not deactivate a facility that a user is restricted to', async () => {
    const prisma = seed();
    prisma.tables.user.push({ id: 'user-3', organizationId: ORG, fullName: 'Site clerk', restrictedFacilityId: FACILITY });
    const service = new FacilitiesService(prisma as any);
    await expect(service.update(user, FACILITY, { isActive: false })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not touch another organisation’s facility', async () => {
    const service = new FacilitiesService(seed() as any);
    await expect(service.update({ ...user, organizationId: 'org-x' }, FACILITY, { name: 'Hijack' })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Evidence files', () => {
  it('finds the storage key from a public URL, a bare key, or another URL', () => {
    expect(attachmentKey('http://localhost:9000/ghg-attachments/org/row/a%20b.pdf', 'http://localhost:9000/ghg-attachments')).toBe('org/row/a b.pdf');
    expect(attachmentKey('org/row/file.pdf', 'http://cdn')).toBe('org/row/file.pdf');
    expect(attachmentKey('https://s3.example.com/ghg-attachments/org/row/f.pdf', undefined, 'ghg-attachments')).toBe('org/row/f.pdf');
    expect(safeFileName('bill "May".pdf')).toBe('bill _May_.pdf');
  });

  function withAttachment(status = 'draft') {
    const prisma = seed(status as any);
    prisma.tables.activityData.push({ id: 'row-1', organizationId: ORG, facilityId: FACILITY, reportingPeriodId: PERIOD, categoryId: CAT.stationary });
    prisma.tables.attachment.push({
      id: 'att-1', activityDataId: 'row-1', fileName: 'tanesco-may.pdf', fileUrl: 'org/row-1/tanesco-may.pdf',
      fileType: 'application/pdf', fileSizeBytes: BigInt(2048), uploadedBy: 'user-1',
    });
    const service = new AttachmentsService(prisma as any);
    // Replace the storage client with a fake so tests never reach S3/MinIO.
    const sent: any[] = [];
    (service as any).s3 = {
      send: async (cmd: any) => {
        sent.push(cmd);
        return cmd.constructor.name === 'GetObjectCommand' ? { Body: `BODY:${cmd.input.Key}`, ContentType: 'application/pdf' } : {};
      },
    };
    return { prisma, service, sent };
  }

  it('downloads a file for any role in the organisation, never across organisations', async () => {
    const { service } = withAttachment();
    const file = await service.download({ ...user, role: 'verifier' } as any, 'row-1', 'att-1');
    expect(file).toMatchObject({ fileName: 'tanesco-may.pdf', fileType: 'application/pdf', stream: 'BODY:org/row-1/tanesco-may.pdf' });
    await expect(service.download({ ...user, organizationId: 'org-x' }, 'row-1', 'att-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removes a file only while the period is a draft', async () => {
    const draft = withAttachment('draft');
    await draft.service.remove(user, 'row-1', 'att-1');
    expect(draft.prisma.tables.attachment).toHaveLength(0);
    expect(draft.sent.map((c: any) => c.input.Key)).toEqual(['org/row-1/tanesco-may.pdf']);

    const approved = withAttachment('approved');
    await expect(approved.service.remove(user, 'row-1', 'att-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(approved.prisma.tables.attachment).toHaveLength(1);
  });

  it('refuses new evidence on an approved period and sends file sizes as numbers', async () => {
    const approved = withAttachment('approved');
    const file = { originalname: 'x.pdf', mimetype: 'application/pdf', size: 10, buffer: Buffer.from('x') };
    await expect(approved.service.upload(user, 'row-1', file)).rejects.toBeInstanceOf(BadRequestException);
    expect(JSON.parse(JSON.stringify(approved.prisma.tables.attachment[0])).fileSizeBytes).toBe(2048);
  });
});

describe('Approval: separation of duties', () => {
  async function submitted() {
    const prisma = seed();
    prisma.tables.user.push({ id: 'user-2', organizationId: ORG, fullName: 'Second Admin' });
    const data = makeService(prisma);
    await data.create(user, { ...base, categoryId: CAT.stationary, sourceName: 'Generator', fuelOrMaterialType: 'Diesel', quantity: 100, unit: 'litres' }, {} as any);
    const service = new ReportingPeriodsService(prisma as any, {} as any, data as any);
    await service.submit(user, PERIOD);
    return { prisma, service };
  }

  it('refuses to submit an empty period', async () => {
    const prisma = seed();
    const service = new ReportingPeriodsService(prisma as any, {} as any, {} as any);
    await expect(service.submit(user, PERIOD)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not let the submitter approve; another Admin can', async () => {
    const { prisma, service } = await submitted();
    await expect(service.approve(user, PERIOD)).rejects.toBeInstanceOf(ForbiddenException);
    const approved = await service.approve(other, PERIOD);
    expect(approved).toMatchObject({ status: 'approved', approvedBy: 'user-2' });
    expect(prisma.tables.reportingPeriod[0].submittedBy).toBe('user-1');
  });

  it('sends a submitted period back to draft with a reason', async () => {
    const { prisma, service } = await submitted();
    await service.returnToDraft(other, PERIOD, 'Generator litres look doubled for May');
    expect(prisma.tables.reportingPeriod[0]).toMatchObject({
      status: 'draft', submittedBy: null, returnReason: 'Generator litres look doubled for May', returnedBy: 'user-2',
    });
    await expect(service.returnToDraft(other, PERIOD, 'again')).rejects.toBeInstanceOf(BadRequestException);

    const [listed] = await service.list(user);
    expect(listed.returnedByName).toBe('Second Admin');
    expect(listed.submittedByName).toBe(null);

    await service.submit(user, PERIOD);
    expect((await service.list(user))[0].submittedByName).toBe('Demo Admin');
  });
});
