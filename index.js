/* jslint es6 */
"use strict";
const pkg = require('./package.json')
const web3Utils = require('web3-utils')
const url = require('url')
const { send } = require('micro')
const { Exporter } = require('san-exporter')
const rp = require('request-promise-native')
const uuidv1 = require('uuid/v1')
const metrics = require('./src/metrics')
const exporter = new Exporter(pkg.name)

const CONFIRMATIONS = parseInt(process.env.CONFIRMATIONS || "3")
const BLOCK_INTERVAL = parseInt(process.env.BLOCK_INTERVAL || "10")

const PARITY_NODE = process.env.PARITY_URL || "http://localhost:8545/"
const DEFAULT_TIMEOUT = parseInt(process.env.DEFAULT_TIMEOUT || "30000")

let lastProcessedPosition = {
  blockNumber: parseInt(process.env.START_BLOCK || "-1"),
  primaryKey: parseInt(process.env.START_PRIMARY_KEY || "-1")
}

const request = rp.defaults({
  method: 'POST',
  uri: PARITY_NODE,
  timeout: DEFAULT_TIMEOUT,
  time: true,
  gzip: true,
  json: true
})

const sendRequest = (async (method, params) => {
  metrics.requestsCounter.inc()

  const startTime = new Date()
  return request({
    body: {
      jsonrpc: '2.0',
      id: uuidv1(),
      method: method,
      params: params
    }
  }).then(({ result, error }) => {
    metrics.requestsResponseTime.observe(new Date() - startTime)

    if (error) {
      return Promise.reject(error)
    }

    return result
  })
})

const transformTransaction = (trx) => {
  new Array("value", "gasPrice").forEach((numberKey) => trx[numberKey] = web3Utils.hexToNumberString(trx[numberKey]))

  new Array("gas", "nonce", "transactionIndex", "blockNumber").forEach((numberKey) => trx[numberKey] = parseFloat(web3Utils.hexToNumberString(trx[numberKey])))

  delete trx["raw"]

  return trx
}

const getTransactionsForBlocks = (fromBlock, toBlock) => {
  const requests = []
  for (let block = fromBlock; block <= toBlock; block += 1) {
    requests.push(
      sendRequest("eth_getBlockByNumber", [web3Utils.numberToHex(block), true])
    )
  }

  return Promise.all(requests)
}

const getCurrentBlock = () => {
  return sendRequest("eth_blockNumber", []).then(response => {
    return web3Utils.hexToNumber(response)
  })
}

async function work() {
  const currentBlock = await getCurrentBlock() - CONFIRMATIONS

  console.info(`Fetching transactions for interval ${lastProcessedPosition.blockNumber}:${currentBlock}`)

  while (lastProcessedPosition.blockNumber < currentBlock) {
    const toBlock = Math.min(lastProcessedPosition.blockNumber + BLOCK_INTERVAL, currentBlock)
    const blockData = await getTransactionsForBlocks(lastProcessedPosition.blockNumber + 1, toBlock)
    const blockTransactions = blockData.map((block) => block.transactions)
    const transactions = [].concat(...blockTransactions)

    if (transactions.length > 0) {
      for (let i = 0; i < transactions.length; i++) {
        transactions[i].primaryKey = lastProcessedPosition.primaryKey + i + 1

        transactions[i] = transformTransaction(transactions[i])
      }

      console.info(`Storing and setting primary keys ${transactions.length} transactions for blocks ${lastProcessedPosition.blockNumber + 1}:${toBlock}`)

      await exporter.sendDataWithKey(transactions, "primaryKey")

      lastProcessedPosition.primaryKey += transactions.length
    }

    lastProcessedPosition.blockNumber = toBlock
    await exporter.savePosition(lastProcessedPosition)
    console.info(`Progressed to block ${toBlock}`)
  }
}

async function fetchTransactions() {
  await work()
    .then(() => {
      console.log(`Progressed to position ${JSON.stringify(lastProcessedPosition)}`)

      // Look for new events every 30 sec
      setTimeout(fetchTransactions, 30 * 1000)
    })
}

async function initLastProcessedBlock() {
  const lastPosition = await exporter.getLastPosition()

  if (lastPosition) {
    lastProcessedPosition = lastPosition
    console.info(`Resuming export from position ${JSON.stringify(lastPosition)}`)
  } else {
    await exporter.savePosition(lastProcessedPosition)
    console.info(`Initialized exporter with initial position ${JSON.stringify(lastProcessedPosition)}`)
  }
}

async function init() {
  await exporter.connect()
  await initLastProcessedBlock()
  await fetchTransactions()
}

init()


const healthcheckKafka = () => {
  return new Promise((resolve, reject) => {
    if (exporter.producer.isConnected()) {
      resolve()
    } else {
      reject("Kafka client is not connected to any brokers")
    }
  })
}

module.exports = async (request, response) => {
  const req = url.parse(request.url, true);

  switch (req.pathname) {
    case '/healthcheck':
      return healthcheckKafka()
        .then(() => send(response, 200, "ok"))
        .catch((err) => send(response, 500, `Connection to kafka failed: ${err}`))

    case '/metrics':
      metrics.currentLedger.set(lastProcessedPosition.blockNumber)

      response.setHeader('Content-Type', metrics.register.contentType);
      return send(response, 200, metrics.register.metrics())

    default:
      return send(response, 404, 'Not found');
  }
}
