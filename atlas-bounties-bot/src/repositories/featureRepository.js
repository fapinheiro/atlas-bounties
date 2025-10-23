const config = require('../core/config');
const logger = require('../core/logger');



/**
 * Create address associated with featureId so that we can audit deposits later
 * @param {*} featureId 
 * @returns 
 */
const findAllFeaturesOrderedByAmountDesc = async () => {
    
    if (!featureId) {
        throw new Error('Feature ID is required to generate address for deposit.');
    }

    const payload = {
        method: 'wallet_address',
        params: {
            index: Number(featureId),
            name: config.liquid.walletName,
            with_text_qr: false
        },
        id: generateSixDigitNumber(),
        jsonrpc: '2.0'
    };

    try {
        const data = await api.post('/', payload); 
        if (!data.result?.address) {
            throw new Error(data.error.message);
        }
        if (data.result?.address) {
            logger.info(`Liquid deposit created for feature: ${featureId} and Address: ${data.result?.address}`);
            return data.result; 
        }
        if (data.async === true) {
            throw new Error('API Liquid respondeu em modo assíncrono. Tente novamente em alguns instantes.');
        }
        throw new Error('Resposta inesperada da API Liquid ao gerar Depix address.');
    } catch (error) {
        const errorMessage = error.response?.data?.response?.errorMessage || error.message || 'Erro desconhecido na API Liquid.';
        logger.error(`Failed to generate Depix address for deposit: ${errorMessage}`);
        throw new Error(`Falha ao gerar Depix address: ${errorMessage}`);
    }
};



module.exports = {
    generateAddressForDeposit
};