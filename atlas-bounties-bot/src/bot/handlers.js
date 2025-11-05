const { Markup } = require('telegraf');
const config = require('../core/config');
const logger = require('../core/logger');
const { escapeMarkdownV2 } = require('../utils/escapeMarkdown');
const { validateMonetaryAmount } = require('../utils/validateMonetaryAmount');
const { validateInput } = require('../utils/validateInput');
const liquidApiService = require('../services/liquidApiService');
const atlasApiService = require('../services/atlasApiService');
const { generateCustomQRCode, generateMinimalQRCode } = require('../services/qrCodeGenerator');

let awaitingInputForUser = {};

const registerBotHandlers = (bot, dbPool) => {

    const clearUserState = (userId) => {
        if (userId) delete awaitingInputForUser[userId];
    };

    const setUserState = (userId, state) => {
        if (userId) awaitingInputForUser[userId] = state;
    };

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

    // TODO revisar textos e mensagens para o usuário
    // Menu principal para usuários validados
    const mainMenuKeyboardObj = Markup.inlineKeyboard([
        [Markup.button.callback('📋 Listar funcionalidades', 'list_features')],
        [Markup.button.callback('🆕 Requisitar uma nova funcionalidade', 'request_feature')],
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
                try {
                    await ctx.editMessageText(message, {
                        reply_markup: keyboard.reply_markup,
                        parse_mode: message.includes('*') ? 'MarkdownV2' : undefined
                    });
                } catch (error) {
                    // await ctx.replyWithMarkdownV2(message, { reply_markup: keyboard.reply_markup });
                    await ctx.reply(message, keyboard);
                }
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
                `Acreditamos que novas funcionalidades devem ter valor real. Por isso, as funcionalidades apenas serão aceitas mediante um depósito em Pix, Depix, L\-BTC ou USDT na rede liquid, garantindo que apenas propostas sérias sejam consideradas.\n\n` +
                `Acreditamos que ninguém irá sugerir ou votar em algo que não tenha valor real para si mesmo\. Portanto, funcionalidades com mais depósitos terão prioridade na implementação.\n\n` +
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

            // Buscar top 10 funcionalidades do banco de dados
            const { rows: features } = await dbPool.query(
                `SELECT id, title, depix_amount 
                 FROM features 
                 WHERE status = 'confirmed'
                 ORDER BY ranking DESC 
                 LIMIT 10`,
                []
            );

            let message = `**Lista das Top 10 Funcionalidades**\n\n`;

            let buttons = [];

            if (features.length === 0) {
                message += `Nenhuma funcionalidade ainda\\. Seja o primeiro e envie uma melhoria para o Atlas Bridge\\!`;
            } else {
                features.forEach((feature, i) => {
                    buttons.push([Markup.button.callback(`${i+1}\. ${feature.title}`, `feature_details:${feature.id}`)]);
                });
            }

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

            const { rows } = await dbPool.query(`
                SELECT id, title, short_description, detailed_description, depix_amount, lbtc_amount, usdt_amount
                FROM features WHERE id = $1
            `, [featureId]);

            const feature = rows[0];

            const message = `📋 **${feature.id}\\# \\- ${feature.title}**\n\n` +
                                     `${escapeMarkdownV2(feature.short_description)}\n\n` +
                                     `${escapeMarkdownV2(feature.detailed_description)}\n\n` +
                                     `Recompensas:\n` +
                                     `Depix: ${escapeMarkdownV2(Number(feature.depix_amount).toFixed(2))}\n` +
                                     `L\\-BTC: ${feature.lbtc_amount}\n` + 
                                     `USDT: ${escapeMarkdownV2(Number(feature.usdt_amount).toFixed(2))}\n`;
            
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

            const { rows } = await dbPool.query(`
                SELECT id, title, short_description, detailed_description
                FROM features WHERE id = $1
            `, [featureId]);

            const feature = rows[0];

            const message = `📋 **${feature.id}\\# ${feature.title}**\n\n` +
                `Você está prestes a votar na funcionalidade acima\\. Ao confirmar, você concorda em depositar um valor qualquer em uma das opções abaixo para que seu voto seja contabilizado\\.\n\n`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('💸 Pix', 'start_vote_feature_pix:' + feature.id)],
                [Markup.button.callback('💼 Depix / L-BTC / USDT', 'start_vote_feature_depix:' + feature.id)],
                [Markup.button.callback('❌ Cancelar', 'back_to_main_menu')]
            ]);
            
            await ctx.editMessageText(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
            
        } catch (error) {
            logError('start_vote_feature', error, ctx);
            await ctx.answerCbQuery('❌ Erro ao iniciar votação de funcionalidade', true);
        }
    });

    /** 
     * Iniciar votação na funcionalidade selecionada com pagamento por pix
    */
    bot.action(/^start_vote_feature_pix:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const featureId = ctx.match[1];

            const message = `Digite um valor para o deposito Pix\\. O valor deverá ser no máximo de até R$ 3\\.000,00\\.`;
            setUserState(ctx.from.id, { type: 'start_vote_feature_pix', featureId: featureId });

            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Voltar ao Menu', 'back_to_main_menu')]
            ]);
            
            await ctx.editMessageText(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
            
        } catch (error) {
            logError('start_vote_feature_pix', error, ctx);
            await ctx.answerCbQuery('❌ Erro ao iniciar votação com pagamento por Pix', true);
        }
    });

    /** 
     * Iniciar votação na funcionalidade selecionada com pagamento por depix
    */
    bot.action(/^start_vote_feature_depix:(.+)$/, async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const featureId = ctx.match[1];

            const { rows } = await dbPool.query(`
                SELECT id, title, liquid_address
                FROM features WHERE id = $1
            `, [featureId]);

            const feature = rows[0];

            const message = `📋 **${feature.id}\\# ${feature.title}**\n\n` +
                `Realize um deposito Depix / L\\-BTC / USDT no endereço **Liquid** abaixo\\. Após o pagamento ser confirmado atualizaremos a lista de funcionalidades com o valor depositado\\.\n\n` +
                `Em caso de dúvidas ou problemas, contate o suporte em: ${escapeMarkdownV2(config.links.supportContact)}\\.\n\n` +
                `Endereço: \n${escapeMarkdownV2(feature.liquid_address)}`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Voltar ao Menu', 'back_to_main_menu')]
            ]);
            
            await ctx.editMessageText(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
            
        } catch (error) {
            logError('start_vote_feature_depix', error, ctx);
            await ctx.answerCbQuery('❌ Erro ao iniciar votação com pagamento por Depix', true);
        }
    });

    /** 
     * Iniciar votação na funcionalidade selecionada com pagamento por pix
    */
    bot.action('request_feature_pix', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const telegramUserId = ctx.from.id;
            const userState = awaitingInputForUser[telegramUserId];
            const message = `Digite um valor para o deposito Pix\\. O valor deverá ser no máximo de até R$ 3\\.000,00\\.`;
            const sentMessage = ctx.callbackQuery?.message ? await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' }) : await ctx.replyWithMarkdownV2(message);
            setUserState(ctx.from.id, { type: 'request_feature_pix_amount', featureTitle: userState.featureTitle, featureShortDescription: userState.featureShortDescription, featureDetailedDescription: userState.featureDetailedDescription });
        } catch (error) {
            logError('request_feature_pix', error, ctx);
            await ctx.answerCbQuery('❌ Erro ao iniciar votação com pagamento por Pix', true);
        }
    });

    /** 
     * Iniciar votação na funcionalidade selecionada com pagamento por depix
    */
    bot.action('request_feature_depix', async (ctx) => {
        try {
            await ctx.answerCbQuery();
            const telegramUserId = ctx.from.id;
            const userState = awaitingInputForUser[telegramUserId];

            // Obter o próximo ID da funcionalidade
            const { rows } =await dbPool.query(
                `SELECT nextval('features_id_seq')`,
                []
            );

            // Gerar endereço Liquid para depósito para a feature
            const data = await liquidApiService.generateAddressForDeposit(rows[0].nextval);
            const { address } = data;

            // Salvar a nova funcionalidade no banco de dados
            await dbPool.query(
                `INSERT INTO features (id, title, short_description, detailed_description, liquid_address)
                 VALUES ($1, $2, $3, $4, $5)`,
                [rows[0].nextval, userState.featureTitle, userState.featureShortDescription, userState.featureDetailedDescription, address]
            );

            const feature = {
                id: rows[0].nextval,
                title: userState.featureTitle,
                address: address
            }

            const message = `📋 **${feature.id}\\# ${feature.title}**\n\n` +
                `Sugestão cadastrada com sucesso\\.\n\n`+ 
                `Realize um deposito Depix / L\\-BTC / USDT no endereço **Liquid** abaixo\\. Após o depósito ser confirmado, sua sugestão será liberada e estará elegível para votação e implementação\\.\n\n` +
                `Em caso de dúvidas ou problemas, contate o suporte em: ${escapeMarkdownV2(config.links.supportContact)}\\.\n\n` +
                `Endereço: \n${escapeMarkdownV2(feature.liquid_address)}`;
            
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Voltar ao Menu', 'back_to_main_menu')]
            ]);
            
            await ctx.editMessageText(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
            
        } catch (error) {
            logError('request_feature_depix', error, ctx);
            await ctx.answerCbQuery('❌ Erro ao iniciar votação com pagamento por Depix', true);
        }
    });
    

    /** 
     * Iniciar solicitação de uma nova feature
    */
    bot.action('request_feature', async (ctx) => {
        try {
            clearUserState(ctx.from.id); 
            const message = 'Vamos iniciar a criação da sua sugestão para o Altas Bridge em 3 passos:\n\n' +
                `1\\. *Título da funcionalidade* \\- Um título curto e objetivo para a funcionalidade que você deseja sugerir em até 50 caracteres\\.\n\n` +
                `2\\. *Descrição curta* \\- Uma breve descrição da funcionalidade em até 100 caracteres\\.\n\n` +
                `3\\. *Descrição detalhada* \\- Uma descrição completa da funcionalidade, explicando seu funcionamento e benefícios em até 500 caracteres\\.\n\n` +
                `Por favor, digite o *título da funcionalidade* em até 50 caracteres para começar\\.`;
            const sentMessage = ctx.callbackQuery?.message ? await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' }) : await ctx.replyWithMarkdownV2(message);
            setUserState(ctx.from.id, { type: 'request_feature_initial' });
            await ctx.answerCbQuery();
        } catch (error) { 
            logError('request_feature_initial', error, ctx); 
            if (!ctx.answered) { try { await ctx.answerCbQuery('Ops! Tente novamente.'); } catch(e){} }
            await ctx.replyWithMarkdownV2('Por favor, digite o titulo da funcionalidade em até 50 caracteres\\.');
        }
    });

    bot.on('text', async (ctx) => {
        const text = ctx.message.text.trim();
        const telegramUserId = ctx.from.id;
        const userState = awaitingInputForUser[telegramUserId];

        if (text.startsWith('/')) { clearUserState(telegramUserId); return; }

        logger.info(`Text input from User ${telegramUserId}: "${text}" in state: ${JSON.stringify(userState)}`);
        
        // Apagar mensagem do usuário para manter o chat limpo (exceto comandos)
        if (userState && !text.startsWith('/')) {
            try {
                await ctx.deleteMessage();
            } catch (e) {
                // Ignorar erro se não conseguir apagar
            }
        }

        if (userState && userState.type === 'request_feature_initial') {
            try {
                const validation = validateInput(text, {
                    maxValue: 50
                });
                if (validation.valid) {
                    const message = `Agora, digite o *uma descrição curta* para a funcionalidade em até 100 caracteres\\.`;
                    const sentMessage = ctx.callbackQuery?.message ? await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' }) : await ctx.replyWithMarkdownV2(message);
                    setUserState(ctx.from.id, { type: 'request_feature_short_description', featureTitle: text });
                } else { 
                    await ctx.replyWithMarkdownV2(`Titulo inválido\\. Por favor, envie um texto de até 50 caracteres\\.`);
                }
           } catch (error) { 
               logError('request_feature_short_description', error, ctx); 
               if (!ctx.answered) { try { await ctx.answerCbQuery('Ops! Tente novamente.'); } catch(e){} }
               await ctx.replyWithMarkdownV2('Agora, digite o *uma descrição curta* para a funcionalidade\\.');
           }

        } else if (userState && userState.type === 'request_feature_short_description' ) {
            try {
                const validation = validateInput(text, {
                    maxValue: 100
                });
                if (validation.valid) {
                    const message = `Quase lá, digite o *uma descrição detalhada* para a funcionalidade em até 500 caracteres\\.`;
                    const sentMessage = ctx.callbackQuery?.message ? await ctx.editMessageText(message, { parse_mode: 'MarkdownV2' }) : await ctx.replyWithMarkdownV2(message);
                    setUserState(ctx.from.id, { type: 'request_feature_detailed_description', featureTitle: userState.featureTitle, featureShortDescription: text });
                } else { 
                    await ctx.replyWithMarkdownV2(`Descrição inválida\\. Por favor, envie um texto de até 100 caracteres\\.`);
                }
            } catch (error) { 
                logError('request_feature_detailed_description', error, ctx); 
                if (!ctx.answered) { try { await ctx.answerCbQuery('Ops! Tente novamente.'); } catch(e){} }
                await ctx.replyWithMarkdownV2('Para finalizar, digite o *uma descrição detalhada* para a funcionalidade em até 500 caracteres\\.');
            }
        } else if (userState && userState.type === 'request_feature_detailed_description' ) {
            try {
                const validation = validateInput(text, {
                    maxValue: 500
                });
                if (validation.valid) {
                    const message = `Para finalizar o cadastro é necessário realizar um depósito de qualquer valor\\. Por favor, selecione abaixo uma forma de pagamento\\.`;
                    const keyboard = Markup.inlineKeyboard([
                        [Markup.button.callback('💸 Pix', 'request_feature_pix')],
                        [Markup.button.callback('💼 Depix / L-BTC / USDT', 'request_feature_depix')],
                        [Markup.button.callback('❌ Cancelar', 'back_to_main_menu')]
                    ]);
                    await ctx.replyWithMarkdownV2(message, { parse_mode: 'MarkdownV2', reply_markup: keyboard.reply_markup });
                    setUserState(ctx.from.id, { type: 'request_feature_payment_method', featureTitle: userState.featureTitle, featureShortDescription: userState.featureShortDescription, featureDetailedDescription: text });
                } else { 
                    await ctx.replyWithMarkdownV2(`Descrição inválida\\. Por favor, envie um texto de até 500 caracteres\\.`);
                }
            } catch (error) { 
                logError('request_feature_detailed_description', error, ctx); 
                if (!ctx.answered) { try { await ctx.answerCbQuery('Ops! Tente novamente.'); } catch(e){} }
                await ctx.replyWithMarkdownV2('Para finalizar o cadastro é necessário realizar um depósito de qualquer valor\\. Por favor, selecione abaixo um forma de pagamento\\.');
            }
        } else if (userState && userState.type === 'start_vote_feature_pix') {

            // Validate monetary amount
            const maxAllowed = 3000;
            const validation = validateMonetaryAmount(text, {
                minValue: 1,
                maxValue: maxAllowed,
                maxDecimals: 2
            });

            if (validation.valid) {
                const amount = validation.value;
                logger.info(`Received amount ${amount} for deposit from user ${telegramUserId}`);

                try {
                    
                    // Localizar endereço liquid da feature
                    const { rows } = await dbPool.query(`
                        SELECT id, title, liquid_address
                        FROM features WHERE id = $1
                    `, [userState.featureId]);
                    let feature = rows[0];

                    // TODO remover hardcode do endereço liquid
                    feature.liquid_address = 'lq1qqv43u2v8kmalvwmek7und4agdcxl6lq2juffljundpvjzyyvz82utl5use54jpvx3yx8s80zy6c8gt6s9mtvc2lqur79atzq3'; 

                    // Gerar Pix via API Atlas
                    // TODO remover comentario
                    // const pixData = await atlasApiService.generatePixForDeposit(amount,feature.liquid_address);

                    let pixData = {
                        id: '65e7ceba-1fc1-4cbd-a054-d205faeaa173',
                        qrCode: '00020101021226860014br.gov.bcb.pix2564qrcode.fitbank.com.br/QR/cob/038B94EE0B5149E6567D609B1E86F3DD6365204000053039865802BR5925PLEBANK.COM.BR SOLUCOES E6007BARUERI61080645400062070503***6304B7DB'
                    }
                    
                    // Persisitir transação no banco de dados
                    const dbResult = await dbPool.query( 'INSERT INTO features_pix_transactions (feature_id, user_id, requested_brl_amount, depix_amount_expected, pix_qr_code_payload, payment_status, atlas_transaction_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [userState.featureId, parseInt(telegramUserId), amount, (amount - 0.99), pixData.qrCode, 'PENDING', pixData.id]);
                    const internalTxId = dbResult.rows[0].id;
                    logger.info(`Transaction ${internalTxId} for BRL ${amount.toFixed(2)} saved. Pix API ID: ${pixData.id}`);
    
                    let caption = `💸 **PIX \\- R\\$ ${escapeMarkdownV2(amount.toFixed(2))}**\n\n`;
                    caption += `📱 Escaneie com seu banco\n`;
                    caption += `⏱️ Validade: 19 minutos\n\n`;
                    caption += `**PIX Copia e Cola:**\n`;
                    caption += `\`${escapeMarkdownV2(pixData.qrCode)}\`\n\n`;
                    caption += `Após o depósito ser confirmado, sua sugestão será liberada e estará elegível para votação e implementação\\.\n\n`;
                    caption += `Em caso de dúvidas ou problemas, contate o suporte em: ${escapeMarkdownV2(config.links.supportContact)}\\.\n\n`;
                    
                    // Adicionar botoes
                    // TODO implementar cancelar pix
                    const keyboard = Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Voltar ao Menu', 'back_to_main_menu')]
                        // [Markup.button.callback('❌ Cancelar', `cancel_qr:${pixData.id}`)]
                    ]);

                    // Gerar QR code personalizado com logo Atlas
                    let qrPhotoMessage;
                    try {
                        // TODO revisar imagem do QR personalizado
                        // const customQRBuffer = await generateCustomQRCode(pixData.qrCode, amount);
                        const customQRBuffer = await generateMinimalQRCode(pixData.qrCode, amount);
                        qrPhotoMessage = await ctx.replyWithPhoto(
                            { source: customQRBuffer },
                            {
                                caption: caption,
                                parse_mode: 'MarkdownV2',
                                reply_markup: keyboard.reply_markup
                            }
                        );
                        logger.info('QR code personalizado com logo Atlas enviado com sucesso');
                    } catch (qrError) {
                        logger.error('Erro ao gerar QR personalizado, usando QR do DePix:', qrError);
                    }

                    clearUserState(telegramUserId);

                } catch (apiError) {
                    clearUserState(telegramUserId);
                    logError('start_vote_feature_pix', apiError, ctx);
                    const errorReply = 'O serviço Pix parece estar instável. Tente novamente mais tarde.';
                    if (messageIdToUpdate) await ctx.telegram.editMessageText(ctx.chat.id, messageIdToUpdate, undefined, errorReply);
                    else await ctx.reply(errorReply);
                }
            } else { 
                await ctx.replyWithMarkdownV2(`Valor inválido\\. Por favor, envie um valor entre R\\$ 1\\.00 e R\\$ ${escapeMarkdownV2(maxAllowed.toFixed(2))} \\(ex: \`45.21\`\\)\\.`);
            }

        } else if (userState && userState.type === 'request_feature_pix_amount') {
            // Validate monetary amount
            const maxAllowed = 3000;
            const validation = validateMonetaryAmount(text, {
                minValue: 1,
                maxValue: maxAllowed,
                maxDecimals: 2
            });

            if (validation.valid) {
                const amount = validation.value;
                logger.info(`Received amount ${amount} for deposit from user ${telegramUserId}`);

                try {

                    // Obter o próximo ID da funcionalidade
                    const { rows } =await dbPool.query(
                        `SELECT nextval('features_id_seq')`,
                        []
                    );
    
                    // Gerar endereço Liquid para depósito para a feature
                    const data = await liquidApiService.generateAddressForDeposit(rows[0].nextval);
                    const { address } = data;
    
                    // Gerar Pix via API Atlas
                    // TODO remover comentario
                    // const pixData = await atlasApiService.generatePixForDeposit(amount, address);
    
                    // Salvar a nova funcionalidade no banco de dados
                    await dbPool.query(
                        `INSERT INTO features (id, title, short_description, detailed_description, liquid_address)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [rows[0].nextval, userState.featureTitle, userState.featureShortDescription, userState.featureDetailedDescription, address]
                    );

                    // TODO remover teste
                    let pixData = {
                        id: '65e7ceba-1fc1-4cbd-a054-d205faeaa173',
                        qrCode: '00020101021226860014br.gov.bcb.pix2564qrcode.fitbank.com.br/QR/cob/038B94EE0B5149E6567D609B1E86F3DD6365204000053039865802BR5925PLEBANK.COM.BR SOLUCOES E6007BARUERI61080645400062070503***6304B7DB'
                    }
                    
                    // Persisitir transação no banco de dados
                    const dbResult = await dbPool.query( 'INSERT INTO features_pix_transactions (feature_id, user_id, requested_brl_amount, depix_amount_expected, pix_qr_code_payload, payment_status, atlas_transaction_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [rows[0].nextval, parseInt(telegramUserId), amount, (amount - 0.99), pixData.qrCode, 'PENDING', pixData.id]);
                    const internalTxId = dbResult.rows[0].id;
                    logger.info(`Transaction ${internalTxId} for BRL ${amount.toFixed(2)} saved. Pix API ID: ${pixData.id}`);
    
                    // Objeto agregar campos
                    const feature = {
                        id: rows[0].nextval,
                        title: userState.featureTitle
                    }

                    // Exibir qrcode e dados
                    let caption = `📋 **${feature.id}\\# ${feature.title}**\n\n`;
                    caption += `💸 **PIX \\- R\\$ ${escapeMarkdownV2(amount.toFixed(2))}**\n\n`;
                    caption += `📱 Escaneie com seu banco\n`;
                    caption += `⏱️ Validade: 19 minutos\n\n`;
                    caption += `**PIX Copia e Cola:**\n`;
                    caption += `\`${escapeMarkdownV2(pixData.qrCode)}\`\n\n`;
                    caption += `Sugestão cadastrada com sucesso\\. Realize um deposito Pix com os dados acima\\. Após o depósito ser confirmado, sua sugestão será liberada e estará elegível para votação e implementação\\.\n\n`;
                    caption +=  `Em caso de dúvidas ou problemas, contate o suporte em: ${escapeMarkdownV2(config.links.supportContact)}\\.\n\n`;
                        
                    // Adicionar botoes
                    // TODO implementar cancelar pix
                    const keyboard = Markup.inlineKeyboard([
                        [Markup.button.callback('⬅️ Voltar ao Menu', 'back_to_main_menu')]
                        // [Markup.button.callback('❌ Cancelar', `cancel_qr:${pixData.id}`)]
                    ]);
    
                    // Gerar QR code personalizado com logo Atlas
                    let qrPhotoMessage;
                    try {
                        // TODO revisar imagem do QR personalizado
                        // const customQRBuffer = await generateCustomQRCode(pixData.qrCode, amount);
                        const customQRBuffer = await generateMinimalQRCode(pixData.qrCode, amount);
                        qrPhotoMessage = await ctx.replyWithPhoto(
                            { source: customQRBuffer },
                            {
                                caption: caption,
                                parse_mode: 'MarkdownV2',
                                reply_markup: keyboard.reply_markup
                            }
                        );
                        logger.info('QR code personalizado com logo Atlas enviado com sucesso');
                    } catch (qrError) {
                        logger.error('Erro ao gerar QR personalizado, usando QR do DePix:', qrError);
                    }
    
                    clearUserState(telegramUserId);
                } catch (error) { 
                    logError('finalize_request_feature', error, ctx); 
                    if (!ctx.answered) { try { await ctx.answerCbQuery('Ops! Tente novamente.'); } catch(e){} }
                    await ctx.replyWithMarkdownV2('❌ Erro ao registrar a funcionalidade\\. Por favor, tente /start novamente\\.');
                }
                
            } else { 
                await ctx.replyWithMarkdownV2(`Valor inválido\\. Por favor, envie um valor entre R\\$ 1\\.00 e R\\$ ${escapeMarkdownV2(maxAllowed.toFixed(2))} \\(ex: \`45.21\`\\)\\.`);
            }

        } else {
            // Estado desconhecido ou não tratado
            clearUserState(telegramUserId);
            await ctx.reply('❌ Comando não reconhecido. Por favor, use /start para começar.');
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