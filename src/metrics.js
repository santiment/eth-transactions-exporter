var { Counter, Gauge, Summary } = require('prom-client')

module.exports.ledgersCounter = new Counter({
    name: 'downloaded_ledgers_count',
    help: 'Number of ledgers downloaded'
});

module.exports.transactionsCounter = new Counter({
    name: 'downloaded_transactions_count',
    help: 'Number of transactions downloaded'
});

module.exports.requestsCounter = new Counter({
    name: 'requests_made_count',
    help: 'Number of requests made to the rippled node',
    labelNames: ['connection']
});

module.exports.requestsResponseTime = new Summary({
    name: 'requests_response_time',
    help: 'The response time of the requests to rippled',
    labelNames: ['connection']
});

module.exports.currentLedger = new Gauge({
    name: 'current_ledger',
    help: 'The current ledger being uploaded'
});

module.exports.startCollection = function () {
    console.info(`Starting the collection of metrics, the metrics are available on /metrics`);
    require('prom-client').collectDefaultMetrics();
};

module.exports.register = require('prom-client').register