import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckError,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly redis: Redis;

  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.redis = new Redis(config.get<string>('queue.redisUrl') as string, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  @Public()
  @Get()
  @HealthCheck()
  async check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
      () => this.checkRedis(),
    ]);
  }

  @Public()
  @Get('live')
  async live() {
    // Liveness: process is up and responding. No dependency checks — a
    // transient database blip should not cause an orchestrator to restart
    // an otherwise-healthy pod.
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  async ready() {
    // Readiness: safe to receive traffic — dependencies must be reachable.
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.checkRedis(),
    ]);
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }
      await this.redis.ping();
      return { redis: { status: 'up' } };
    } catch (err) {
      throw new HealthCheckError('Redis check failed', {
        redis: { status: 'down', message: (err as Error).message },
      });
    }
  }
}

