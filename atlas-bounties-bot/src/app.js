const config = require('./core/config');
const logger = require('./core/logger');
const express = require('express');
const { registerBotHandlers } = require('./bot/handlers');
const https = require('https');
const { Telegraf } = require('telegraf');

logger.info('--------------------------------------------------');
logger.info('-------- Starting Atlas Bounties Bot -------------');
logger.info(`------ Environment: ${config.app.nodeEnv} --------`);
logger.info('--------------------------------------------------');

const httpsAgent = new https.Agent({
    keepAlive: true,
    family: 4,
    rejectUnauthorized: true,
    timeout: 30000
});

const bot = new Telegraf(config.telegram.botToken, {
    telegram: {
        apiRoot: 'https://api.telegram.org',
        webhookReply: false,
        agent: httpsAgent,
        apiMode: 'bot'
    },
    handlerTimeout: 90000
});

const getBotInstance = () => bot;

registerBotHandlers(bot);

// Tentativa de conectar ao Telegram com retry e fallback
const disableTelegram = process.env.DISABLE_TELEGRAM === 'true';

if (disableTelegram) {
    logger.warn('Telegram Bot is DISABLED via DISABLE_TELEGRAM environment variable');
    logger.info('Application running in webhook-only mode');
} else {
    const maxRetries = 3;
    let retryCount = 0;

    const launchBot = async () => {
        try {
            logger.info('Attempting to connect to Telegram Bot...');

            // First get bot info to verify connection
            const botInfo = await bot.telegram.getMe();
            bot.botInfo = botInfo;
            logger.info(`Bot verified: @${botInfo.username} (ID: ${botInfo.id})`);

            // Then launch with polling
            await bot.launch({
                webhook: undefined,
                dropPendingUpdates: true,
                allowedUpdates: ['message', 'callback_query', 'inline_query']
            });

            logger.info('Telegram Bot started successfully via polling.');
            logger.info(`Bot username: @${bot.botInfo?.username || 'unknown'}`);

        } catch (err) {
            retryCount++;
            logger.error(`Error starting Telegram Bot (attempt ${retryCount}/${maxRetries}):`, err.message);

            // Log more details about the error
            if (err.response?.error_code === 401) {
                logger.error('Invalid bot token! Please check TELEGRAM_BOT_TOKEN in .env');
            } else if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
                logger.error('Network connection issue. Check internet connectivity and Telegram API access.');
            }

            if (retryCount < maxRetries) {
                logger.info(`Retrying in 5 seconds...`);
                setTimeout(launchBot, 5000);
            } else {
                logger.error('Failed to connect to Telegram after maximum retries');
                logger.warn('Continuing without Telegram bot - webhooks will still work');
                logger.info('To disable this warning, set DISABLE_TELEGRAM=true in .env');
            }
        }
    };

    launchBot();
}

const app = express();

app.use(express.json());

app.get('/', (req, res) => res.status(200).send(`Atlas Bounties Bot App is alive! [ENV: ${config.app.nodeEnv}]`));

const server = app.listen(config.app.port, '0.0.0.0', () => {
    logger.info(`Express server listening on http://0.0.0.0:${config.app.port} for environment ${config.app.nodeEnv}.`);
});

const gracefulShutdown = async (signal) => {
    logger.info(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
        logger.info('HTTP server closed.');
        logger.info('Shutdown complete.');
        process.exit(0);
    });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));