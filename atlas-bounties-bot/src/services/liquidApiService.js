const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../core/config');
const logger = require('../core/logger');
const { json } = require('express');
const { generateSixDigitNumber } = require('../utils/generateSixDigitNumber');

const api = axios.create({
    baseURL: config.liquid.apiBaseUrl,
    timeout: 20000, 
});

if (config.tor.socksProxy && config.app.nodeEnv !== 'development_no_tor') {
    const httpsAgent = new SocksProxyAgent(config.tor.socksProxy);
    api.defaults.httpsAgent = httpsAgent;
    logger.info(`Liquid API service configured to use Tor proxy: ${config.tor.socksProxy}`);
} else {
    logger.info('Liquid API service configured WITHOUT Tor proxy.');
}

api.interceptors.request.use(
    (axiosConfig) => {
        // axiosConfig.headers['Authorization'] = `Bearer ${config.depix.apiJwtToken}`;
        // if (!axiosConfig.url.endsWith('/ping')) {
        //     axiosConfig.headers['X-Nonce'] = uuidv4();
        // }
        axiosConfig.headers['Content-Type'] = 'application/json';
        // logger.info(`Liquid API Request: ${axiosConfig.method.toUpperCase()} ${axiosConfig.url}`, { nonce: axiosConfig.headers['X-Nonce'] || 'N/A' });
        if (axiosConfig.data) {
            logger.info('Liquid API Request Body:', JSON.stringify(axiosConfig.data));
        }
        return axiosConfig;
    },
    (error) => {
        logger.error('Error in Liquid API request interceptor:', error);
        return Promise.reject(error);
    }
);

api.interceptors.response.use(
    (response) => {
        logger.info(`Liquid API Response Status: ${response.status} for ${response.config.url}`);
        logger.info(`Liquid API Response Data: ${JSON.stringify(response.data)}`);
        if (response.data.async === true) {
            logger.warn('Liquid API responded in ASYNC mode. This is not fully handled and may cause issues.');
        }
        return response.data; 
    },
    (error) => {
        if (error.response) {
            logger.error(`Liquid API Error Status: ${error.response.status} for ${error.config.url}`);
            logger.error('Liquid API Error Data:', JSON.stringify(error.response.data));
        } else if (error.request) {
            logger.error(`Liquid API Error: No response received for ${error.config.url}.`, error.message);
        } else {
            logger.error('Liquid API Error: Request setup error.', error.message);
        }
        return Promise.reject(error);
    }
);

/**
 * Create address associated with featureId so that we can audit deposits later
 * @param {*} featureId 
 * @returns 
 */
const generateAddressForDeposit = async (featureId) => {
    
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