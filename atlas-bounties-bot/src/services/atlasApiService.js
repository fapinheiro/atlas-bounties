const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { v4: uuidv4 } = require('uuid');
const config = require('../core/config');
const logger = require('../core/logger');

const atlasApi = axios.create({
    baseURL: config.atlas.apiBaseUrl,
    timeout: 20000, 
});

if (config.tor.socksProxy && config.app.nodeEnv !== 'development_no_tor') {
    const httpsAgent = new SocksProxyAgent(config.tor.socksProxy);
    atlasApi.defaults.httpsAgent = httpsAgent;
    logger.info(`Atlas API service configured to use Tor proxy: ${config.tor.socksProxy}`);
} else {
    logger.info('Atlas API service configured WITHOUT Tor proxy.');
}

atlasApi.interceptors.request.use(
    (axiosConfig) => {
        axiosConfig.headers['X-API-Key'] = `${config.atlas.apiJwtToken}`;
        // if (!axiosConfig.url.endsWith('/ping')) {
        //     axiosConfig.headers['X-Nonce'] = uuidv4();
        // }
        axiosConfig.headers['Content-Type'] = 'application/json';
        logger.info(`Atlas API Request: ${axiosConfig.method.toUpperCase()} ${axiosConfig.url}`, { nonce: axiosConfig.headers['X-Nonce'] || 'N/A' });
        if (axiosConfig.data) {
            logger.info('Atlas API Request Body:', JSON.stringify(axiosConfig.data));
        }
        return axiosConfig;
    },
    (error) => {
        logger.error('Error in Atlas API request interceptor:', error);
        return Promise.reject(error);
    }
);

atlasApi.interceptors.response.use(
    (response) => {
        logger.info(`Atlas API Response Status: ${response.status} for ${response.config.url}`);
        logger.info(`Atlas API Response Data: ${JSON.stringify(response.data)}`);
        if (response.data.async === true) {
            logger.warn('Atlas API responded in ASYNC mode. This is not fully handled and may cause issues.');
        }
        return response.data; 
    },
    (error) => {
        if (error.response) {
            logger.error(`Atlas API Error Status: ${error.response.status} for ${error.config.url}`);
            logger.error('Atlas API Error Data:', JSON.stringify(error.response.data));
        } else if (error.request) {
            logger.error(`Atlas API Error: No response received for ${error.config.url}.`, error.message);
        } else {
            logger.error('Atlas API Error: Request setup error.', error.message);
        }
        return Promise.reject(error);
    }
);

const generatePixForDeposit = async (amount, walletAddress) => {
    if (!amount) {
        throw new Error(`Field 'amount' is required.`);
    }
    if (amount < 1 || amount > 3000) {
        throw new Error('Amount must be between 1 and 3000.');
    }
    const payload = {
        amount: amount,
        description: 'Contribuição voluntária para o Atlas Bounties',
        walletAddress: walletAddress
    };

    try {
        const data = await atlasApi.post('/pix/create', payload); 
        if (data.message) {
            throw new Error(data.message);
        }
        if (data.qrCode && data.qrCodeImage && data.expiresAt && data.createdAt) {
            logger.info(`Atlas deposit created with ID: ${data.id}`);
            return data; 
        }
        if (data.async === true) {
            throw new Error('API Atlas respondeu em modo assíncrono. Tente novamente em alguns instantes.');
        }
        throw new Error('Resposta inesperada da API Atlas ao gerar QR Code.');
    } catch (error) {
        const errorMessage = error.message || 'Erro desconhecido na API Atlas.';
        logger.error(`Failed to generate Pix for deposit: ${errorMessage}`);
        throw new Error(`Falha ao gerar QR Code Pix: ${errorMessage}`);
    }
};

const getPixStatus = async (id) => {
    if (!id) {
        throw new Error(`Field 'id' is required.`);
    }
    try {
        const data = await atlasApi.get(`/pix/status/${id}`); 
        if (data.message) {
            throw new Error(data.message);
        }
        if (data.status && data.expiresAt && data.amount) {
            logger.info(`Atlas deposit created with ID: ${data.id}`);
            return data.response; 
        }
        if (data.async === true) {
            throw new Error('API Atlas respondeu em modo assíncrono. Tente novamente em alguns instantes.');
        }
        throw new Error('Resposta inesperada da API Atlas ao gerar QR Code.');
    } catch (error) {
        const errorMessage = error.message || 'Erro desconhecido na API Atlas.';
        logger.error(`Failed to generate Pix for deposit: ${errorMessage}`);
        throw new Error(`Falha ao gerar QR Code Pix: ${errorMessage}`);
    }
};

module.exports = {
    generatePixForDeposit,
    getPixStatus
};