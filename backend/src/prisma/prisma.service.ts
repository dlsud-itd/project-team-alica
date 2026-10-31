import net from 'node:net';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

async function isPortOpen(
  port = 5432,
  host = '127.0.0.1',
  timeoutMs = 200,
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function resolveDatasourceConfig(): Promise<{
  url?: string;
  isLocal: boolean;
}> {
  const isDev =
    process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
  const autoLocal = process.env.AUTO_LOCAL_POSTGRES !== 'false';

  if (!isDev || !autoLocal) {
    return { url: undefined, isLocal: false };
  }

  const portOpen = await isPortOpen(5432);
  if (!portOpen) {
    return { url: undefined, isLocal: false };
  }

  const localCandidates = [
    process.env.LOCAL_DATABASE_URL,
    'postgresql://postgres:postgres@localhost:5432/checkpoint',
    'postgresql://postgres:postgres@localhost:5432/postgres',
  ].filter((url): url is string => Boolean(url));

  for (const candidate of localCandidates) {
    try {
      const probeClient = new PrismaClient({ datasourceUrl: candidate });
      await probeClient.$connect();
      await probeClient.$disconnect();
      return { url: candidate, isLocal: true };
    } catch {
      // Try next local candidate
    }
  }

  return { url: undefined, isLocal: false };
}

const datasourceConfig = await resolveDatasourceConfig();

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super(
      datasourceConfig.url
        ? { datasourceUrl: datasourceConfig.url }
        : undefined,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      if (datasourceConfig.isLocal) {
        this.logger.log(
          `Local PostgreSQL instance detected. Connected to local database: ${datasourceConfig.url}`,
        );
      } else {
        this.logger.log('Connected to remote PostgreSQL database successfully.');
      }
    } catch (error) {
      this.logger.warn(
        `Could not connect to PostgreSQL database on startup: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
