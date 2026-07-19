'use strict';

const { config } = require('./config');
const { getLogger } = require('./logger');

const log = getLogger('request-queue');

let running = 0;
const queue  = [];

function tick() {
  if (running >= config.maxConcurrentRequests || queue.length === 0) return;

  const { fn, resolve, reject } = queue.shift();
  running++;

  fn()
    .then(resolve)
    .catch(reject)
    .finally(() => {
      running--;
      tick();
    });
}

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    tick();
  });
}

module.exports = { enqueue };
