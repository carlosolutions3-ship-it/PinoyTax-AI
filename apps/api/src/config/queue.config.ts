import { registerAs } from '@nestjs/config';

export default registerAs('queue', () => ({
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  rabbitmqUrl: process.env.RABBITMQ_URL ?? 'amqp://localhost:5672',
}));
