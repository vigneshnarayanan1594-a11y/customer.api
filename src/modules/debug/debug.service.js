'use strict';

const { Injectable, Logger } = require('@nestjs/common');

const SLICE_MS = 50;

@Injectable()
class DebugService {
  constructor() {
    this.logger = new Logger(DebugService.name);
  }

  // Starts burning CPU after the response has gone out.
  burnCpu({ seconds, mode }) {
    const end = Date.now() + seconds * 1000;
    this.logger.warn({ msg: 'cpu burn started', seconds, mode });

    if (mode === 'block') {
      setTimeout(() => {
        while (Date.now() < end);   // freezes the event loop on purpose
      }, 100);
      return;
    }

    const slice = () => {
      const sliceEnd = Date.now() + SLICE_MS;
      while (Date.now() < sliceEnd);
      if (Date.now() < end) setImmediate(slice);
    };
    setTimeout(slice, 100);
  }
}

module.exports = { DebugService };
