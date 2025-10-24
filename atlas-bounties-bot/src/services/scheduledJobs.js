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

                // Obtain UTXOs from Liquid API
                const utxos = await liquidApiService.listUtxos();

                // If there are UTXOs to process
                if (utxos.length > 0) {

                    // Process each UTXO
                    for (const utxo of utxos) {

                        // Query features with matching liquid address and not expired
                        const { rows } = await this.dbPool.query(
                            `SELECT id, depix_amount, lbtc_amount, usdt_amount, liquid_address, liquid_height 
                            FROM features 
                            WHERE status not in ('expired') 
                            AND liquid_address = $1`, [utxo.address]);

                        // Find matching feature
                        const feature = rows.find(row => row.liquid_address === utxo.address && row.liquid_height < utxo.height);
                        if (feature) {

                            // L-BTC
                            if (utxo.asset === '144c654344aa716d6f3abcc1ca90e5641e4e2a7f633bc09fe3baf64585819a49' || utxo.asset === '6f0279e9ed041c3d710a9f57d0c02928416460c4b722ae3457a11eec381c526d') {

                                const lbtc_amount = Number(feature.lbtc_amount) + Number(utxo.value);
                                const ranking = Number(lbtc_amount) + Number(feature.depix_amount) + Number(feature.usdt_amount);
                                await this.dbPool.query(
                                    `UPDATE features 
                                    SET lbtc_amount = $1, liquid_height = $2, ranking = $3, updated_at = NOW(), status = 'confirmed' 
                                    WHERE id = $4`,
                                    [lbtc_amount, utxo.height, ranking, feature.id]
                                );
                                logger.info(`[ScheduledJobs] Updated feature ${feature.id} with new amount ${utxo.value} of L-BTC at height ${utxo.height}`);
                            }

                            // USDT
                            if (utxo.asset === 'ce091c998b83c78bb71a632313ba3760f1763d9cfcffae02258ffa9865a37bd2') {

                                const usdt_amount = Number(feature.usdt_amount) + (Number(utxo.value) / Number(1e8));
                                const ranking = Number(usdt_amount) + Number(feature.depix_amount) + Number(feature.usdt_amount);
                                await this.dbPool.query(
                                    `UPDATE features 
                                    SET usdt_amount = $1, liquid_height = $2, ranking = $3, updated_at = NOW(), status = 'confirmed' 
                                    WHERE id = $4`,
                                    [usdt_amount, utxo.height, ranking, feature.id]
                                );
                                logger.info(`[ScheduledJobs] Updated feature ${feature.id} with new amount ${utxo.value} of Depix at height ${utxo.height}`);
                            }

                            // Depix
                            if (utxo.asset === '02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189') {

                                const depix_amount = Number(feature.depix_amount) + (Number(utxo.value) / Number(1e8));
                                const ranking = Number(depix_amount) + Number(feature.lbtc_amount) + Number(feature.usdt_amount);
                                await this.dbPool.query(
                                    `UPDATE features 
                                    SET depix_amount = $1, liquid_height = $2, ranking = $3, updated_at = NOW(), status = 'confirmed' 
                                    WHERE id = $4`,
                                    [depix_amount, utxo.height, ranking, feature.id]
                                );
                                logger.info(`[ScheduledJobs] Updated feature ${feature.id} with new amount ${utxo.value} of Depix at height ${utxo.height}`);
                            }

                            
                        }
                    }
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