const { Markup } = require('telegraf');
const config = require('../core/config');
const logger = require('../core/logger');
const { escapeMarkdownV2 } = require('../utils/escapeMarkdown');
const liquidApiService = require('../services/liquidApiService');

let awaitingInputForUser = {};

const registerBotHandlers = (bot, dbPool) => {

    const logError = (handlerName, error, ctx) => {
        const userId = ctx?.from?.id || 'N/A';
        logger.error(`Error in ${handlerName} for user ${userId}: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
    };

    // Helper function to send auto-deleting error messages
    const sendTempError = async (ctx, message = 'Ops! Tente novamente.', timeout = 5000) => {
        try {
            const msg = await ctx.reply(message);
            setTimeout(async () => {
                try {
                    await ctx.deleteMessage(msg.message_id);
                } catch (e) {
                    // Message may already be deleted
                }
            }, timeout);
        } catch (e) {
            logger.error('Failed to send temp error:', e);
        }
    };

    // Menu principal para usuários validados
    const mainMenuKeyboardObj = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Listar funcionalidades', 'list_features')],
        [Markup.button.callback('🆕 Requisitar uma nova funcionalidade', 'request_feature')],
        [Markup.button.callback('🗳️ Votar em uma funcionalidade', 'vote_feature')],
        [Markup.button.url('💬 Comunidade Atlas', config.links.communityGroup)]
    ]);

    const sendMainMenu = async (ctx, messageText = null) => {
        try {
            const userId = ctx.from?.id;

            let keyboard, message;

            // Usuário validado - menu completo
            message = messageText || `✅ Bem-vindo de volta!\n\nO que você gostaria de fazer hoje?`;
            keyboard = mainMenuKeyboardObj;

            if (ctx.callbackQuery?.message?.message_id) {
                await ctx.editMessageText(message, {
                    reply_markup: keyboard.reply_markup,
                    parse_mode: message.includes('*') ? 'MarkdownV2' : undefined
                });
            } else {
                if (message.includes('*')) {
                    await ctx.replyWithMarkdownV2(message, { reply_markup: keyboard.reply_markup });
                } else {
                    await ctx.reply(message, keyboard);
                }
            }

        } catch (error) {
            logError('sendMainMenu/editOrReply', error, ctx);
            if (!ctx.headersSent) await sendTempError(ctx);
        }
    };

    const clearUserState = (userId) => {
        if (userId) delete awaitingInputForUser[userId];
    };

    bot.start(async (ctx) => {
        clearUserState(ctx.from.id);
        const telegramUserId = ctx.from.id;
        const telegramUsername = ctx.from.username || null;
        const firstName = ctx.from.first_name || null;
        const lastName = ctx.from.last_name || null;
        const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;

        // Verificar se tem username
        if (!telegramUsername) {
            await ctx.reply('❌ Você precisa ter um username no Telegram para usar este bot.\n\n' +
                'Para adicionar um username:\n' +
                '1. Vá em Configurações\n' +
                '2. Toque em "Nome de usuário"\n' +
                '3. Escolha um nome único\n' +
                '4. Depois volte e digite /start novamente');
            return;
        }

        logger.info(`User ${telegramUserId} (${telegramUsername}) started the bot.`);

        try {
            let welcomeMsg = `Bem-vindo! 🎯\n\n` +
                `Este é o Atlas Bounties, onde você pode sugerir e votar em funcionalidades para o Atlas Bridge.\n\n` +
                `Acreditamos que novas funcionalidades devem ter valor real. Por isso, as funcionalidades apenas serão aceitas mediante um depósito em Pix ou Depix, garantindo que apenas propostas sérias sejam consideradas.\n\n` +
                `Acreditamos que ninguém irá sugerir ou votar em algo que não tenha valor real para si mesmo\\. Portanto, funcionalidades com mais depósitos terão prioridade na implementação.\n\n` +
                `Sua participação ativa ajuda a moldar o futuro do Atlas Bridge, tornando-o mais útil para todos os usuários.\n\n` +
                `Vamos construir juntos um Atlas Bridge melhor e mais útil para todos!\n\n`;
            await sendMainMenu(ctx, welcomeMsg);
        } catch (error) {
            logError('/start', error, ctx);
            try { await sendTempError(ctx); } catch (e) { logError('/start fallback reply', e, ctx); }
        }
    });

    /** 
     * Voltar ao menu principal
    */
    bot.action('back_to_main_menu', async (ctx) => {
        try {
            clearUserState(ctx.from.id); 
            await ctx.answerCbQuery();
            await sendMainMenu(ctx);
        } catch (error) { 
            logError('back_to_main_menu', error, ctx); 
            await sendTempError(ctx);
        }
    });
    
    /** 
     * Listar funcionalidades disponíveis
    */
    bot.action('list_features', async (ctx) => {
        try {
            // clearUserState(ctx.from.id);
            await ctx.answerCbQuery();

            // TODO: query features from database order by bounty desc
            let features = featuresDB.sort((a, b) => b.bounty - a.bounty);

            let message = `**Lista de Funcionalidades**\n\n`;

            let buttons = [];

            // TODO: to implement pagination
            features.forEach(feature => {
                buttons.push([Markup.button.callback(`${feature.id}# \- ${feature.title} \- R\$ ${feature.bounty.toFixed(2)}`, `feature_details:${feature.id}`)]);
            });

            buttons.push([Markup.button.callback('⬅️ Voltar ao Menu', 'back_to_main_menu')]);

            const keyboard = Markup.inlineKeyboard(buttons);

            if (ctx.callbackQuery?.message) await ctx.editMessageText(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup, disable_web_page_preview: true });
            else await ctx.replyWithMarkdownV2(message, keyboard);
        } catch (error) {
            logError('list_features', error, ctx);
            await sendTempError(ctx);
        }
    });

    /** 
     * Detalhes da funcionalidade selecionada
    */
    bot.action(/^feature_details:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const featureId = ctx.match[1];

            let feature = featuresDB.find(f => f.id.toString() === featureId);

            const message = `📋 **${feature.id}\\# ${feature.title}**\n\n` +
                                     `${escapeMarkdownV2(feature.shortDescription)}\n\n` +
                                     `${escapeMarkdownV2(feature.detailedDescription)}\n\n`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('✅ Votar', 'start_vote_feature:' + feature.id)],
                [Markup.button.callback('❌ Cancelar', 'back_to_main_menu')]
            ]);
            
            await ctx.editMessageText(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
            
        } catch (error) {
            logError('feature_details', error, ctx);
            await ctx.answerCbQuery('❌ Erro ao exibir funcionalidades', true);
        }
    });

    /** 
     * Iniciar votação na funcionalidade selecionada
    */
    bot.action(/^start_vote_feature:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const featureId = ctx.match[1];

            logger.info(`User ${ctx.from.id} is starting vote for feature ${featureId}`);

            let feature = featuresDB.find(f => f.id.toString() === featureId);

            const message = `📋 **${feature.id}\\# ${feature.title}**\n\n` +
                `Você está prestes a votar na funcionalidade acima\\. Ao confirmar, você concorda em depositar um valor qualquer em uma das opções abaixo para que seu voto seja contabilizado\\.\n\n`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💸 Pix', 'start_vote_feature_pix:' + feature.id)],
                [Markup.button.callback('💼 Depix', 'start_vote_feature_depix:' + feature.id)],
                [Markup.button.callback('❌ Cancelar', 'back_to_main_menu')]
            ]);
            
            await ctx.editMessageText(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
            
        } catch (error) {
            logError('start_vote_feature', error, ctx);
            await ctx.answerCbQuery('❌ Erro ao iniciar votação de funcionalidade', true);
        }
    });

    /** 
     * Iniciar votação na funcionalidade selecionada com pagamento por depix
    */
    bot.action(/^start_vote_feature_depix:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const featureId = ctx.match[1];

            logger.info(`User ${ctx.from.id} is starting vote for feature ${featureId}`);

            let feature = featuresDB.find(f => f.id.toString() === featureId);

            const data = await liquidApiService.generateAddressForDeposit(featureId);
            const { address } = data;
                    
            const message = `📋 **${feature.id}\\# ${feature.title}**\n\n` +
                `Realize um deposito no endereço **liquid** abaixo\\. Após o pagamento ser confirmado atualizaremos a lista de funcionalidades com o valor depositado\\.\n\n` +
                `Em caso de dúvidas ou problemas, contate o suporte em: ${escapeMarkdownV2(config.links.supportContact)}\\.\n\n` +
                `${address}`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Voltar ao Menu', 'back_to_main_menu')]
            ]);
            
            await ctx.editMessageText(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
            
        } catch (error) {
            logError('start_vote_feature_depix', error, ctx);
            await ctx.answerCbQuery('❌ Erro ao iniciar votação com pagamento por Depix', true);
        }
    });

    bot.catch((err, ctx) => {
        logError('Global Telegraf bot.catch', err, ctx);
        if (err.message?.includes("query is too old") || err.message?.includes("message is not modified")) return;
        try { ctx.reply('Desculpe, ocorreu um erro inesperado. Por favor, tente /start novamente.'); }
        catch (replyError) { logError('Global bot.catch sendMessage fallback', replyError, ctx); }
    });

    logger.info('Bot handlers registered.');
};

module.exports = { registerBotHandlers };