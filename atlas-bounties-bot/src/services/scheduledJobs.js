const cron = require('node-cron');
const logger = require('../core/logger');
const liquidApiService = require('./liquidApiService');

class ScheduledJobs {
    constructor(dbPool) {
        this.dbPool = dbPool;
        this.jobs = new Map();
    }

    /**
     * Initialize all scheduled jobs
     */
    async initialize() {
        logger.info('[ScheduledJobs] Initializing scheduled jobs...');

        // Schedule liquid payment detector
        this.scheduleLiquidPaymentDetector();

        logger.info('[ScheduledJobs] All jobs initialized');
    }

    /**
     * To detect payment on liquid network and update amounts in DB
     */
    scheduleLiquidPaymentDetector() {

        // Run every minute
        const job = cron.schedule('*/1 * * * *', async () => {
            logger.info('[ScheduledJobs] Starting liquid payment detector...');

            try {

                const utxos = await liquidApiService.listUtxos();

                if (utxos.length > 0) {

                    // Process each UTXO
                    utxos.forEach(async (utxo) => {

                        const { rows  } = await this.dbPool.query(
                            `SELECT id, depix_amount, lbtc_amount, liquid_address, liquid_height 
                            FROM features 
                            WHERE status not in ('expired') 
                            AND liquid_address = $1`, [utxo.address]);

                        // Find matching feature
                        const feature = rows.find(row => row.liquid_address === utxo.address && row.liquid_height < utxo.height);
                        if (feature) {

                            // L-BTC
                            if (utxo.asset === '144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49') {
                                await this.dbPool.query(
                                    `UPDATE features 
                                    SET lbtc_amount = $1, liquid_height = $2, updated_at = NOW() 
                                    WHERE id = $3`,
                                    [Number(feature.lbtc_amount) + Number(utxo.value), utxo.height, feature.id]
                                );
                                logger.info(`[ScheduledJobs] Updated feature ${feature.id} with new amount ${utxo.value} of L-BTC at height ${utxo.height}`);
                            }

                            // // Depix
                            // if (!utxo.asset === '144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49') {
                            //     await this.dbPool.query(
                            //         `UPDATE features 
                            //         SET depix_amount = $1, liquid_height = $2, updated_at = NOW() 
                            //         WHERE id = $3`,
                            //         [Number(feature.depix_amount).toFixed(2) + Number(utxo.value).toFixed(2), utxo.height, feature.id]
                            //     );
                            //     logger.info(`[ScheduledJobs] Updated feature ${feature.id} with new amount ${utxo.value} of Depix at height ${utxo.height}`);
                            // }
                            
                        }
                    });
                }
            

                logger.info('[ScheduledJobs] Liquid payment detection completed');

                // await this.trackJobExecution('daily_limit_reset', {
                //     success: true,
                //     usersReset: resetCount,
                //     executedAt: new Date().toISOString()
                // });

            } catch (error) {
                logger.error('[ScheduledJobs] Daily limit reset failed:', error);

                // await this.trackJobExecution('daily_limit_reset', {
                //     success: false,
                //     error: error.message,
                //     executedAt: new Date().toISOString()
                // });
            }
        }, {
            scheduled: true,
            timezone: "America/Sao_Paulo"
        });

        this.jobs.set('liquid_payment_detector', job);
        logger.info('[ScheduledJobs] Liquid payment detector');
    }


}

module.exports = ScheduledJobs;