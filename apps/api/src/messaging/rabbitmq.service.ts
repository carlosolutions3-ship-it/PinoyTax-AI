import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';

const EXCHANGE_NAME = 'pinoytax.domain-events';

/**
 * Publishes domain events (company.created, payroll.finalized,
 * tax_computation.confirmed, document.uploaded, issue.flagged) to a durable
 * topic exchange on RabbitMQ, per Phase 3 §4.1's async integration
 * architecture. This is distinct from @nestjs/event-emitter, which handles
 * synchronous same-process listeners (e.g. ComplianceService reacting to
 * company.created) — RabbitMQ is for anything that should be consumable by
 * OTHER services/processes (analytics pipeline, external audit exporter,
 * future mobile push fan-out service, etc.), decoupled from this API's
 * uptime.
 */
@Injectable()
export class RabbitMqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection: amqplib.Connection | null = null;
  private channel: amqplib.Channel | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    try {
      const url = this.config.get<string>('queue.rabbitmqUrl');
      this.connection = await amqplib.connect(url as string);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
      this.logger.log('Connected to RabbitMQ and asserted domain-events exchange');
    } catch (err) {
      // A RabbitMQ outage must never take down the whole API — domain event
      // publication is best-effort fan-out, not on the critical request path.
      this.logger.error(`Failed to connect to RabbitMQ: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publish(routingKey: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.channel) {
      this.logger.warn(`RabbitMQ channel unavailable — dropping event ${routingKey}`);
      return;
    }
    try {
      this.channel.publish(
        EXCHANGE_NAME,
        routingKey,
        Buffer.from(JSON.stringify({ ...payload, publishedAt: new Date().toISOString() })),
        { contentType: 'application/json', persistent: true },
      );
    } catch (err) {
      this.logger.error(`Failed to publish ${routingKey}: ${(err as Error).message}`);
    }
  }
}
