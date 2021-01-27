/* ============================================================
 * node-bitkub-ws
 * https://github.com/tuxitor/node-bitkub-api
 *
 * Code shamelessly copied and modified from node-binance-api
 *
 * ============================================================
 * * Copyright 2017-, Jon Eyrick
 * Released under the MIT License
 * ============================================================ */
// Docs: https://github.com/bitkub/bitkub-official-api-docs

/**
 * Node Bitkub WebSocket API
 * //@module .../node-Bitkub-api
 * //@return {object} instance to class object
 */
let api = function Bitkub(options = {}) {
  if (!new.target) return new api(options);
  let Bitkub = this; // eslint-disable-line consistent-this
  'use strict'; // eslint-disable-line no-unused-expressions

  const WebSocket = require('ws');
  const stream = "wss://api.bitkub.com/websocket-api/";
  Bitkub.subscriptions = {};
  const default_options = {
    reconnect: true,
    verbose: false,
    sanitize: false,
    ignoreTickers: false,
    ignoreGlobalTickers: true,
    log: function (...args) {
      console.log(Array.prototype.slice.call(args));
    }
  };
  Bitkub.options = default_options;
  Bitkub.socketHeartbeatInterval = null;

  /**
   * Do nothing
   * @return {undefined}
   */
  const noop = function () { };

  /**
   * Reworked Tuitio's heartbeat code into a shared single interval tick
   * @return {undefined}
   */
  const socketHeartbeat = function () {
    /* sockets removed from `subscriptions` during a manual terminate()
       will no longer be at risk of having functions called on them */
    for (let endpointId in Bitkub.subscriptions) {
      const ws = Bitkub.subscriptions[endpointId];
      if (ws.isAlive) {
        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) ws.ping(noop);
      } else {
        if (Bitkub.options.verbose) Bitkub.options.log('Terminating inactive/broken WebSocket: ' + ws.endpoint);
        if (ws.readyState === WebSocket.OPEN) ws.terminate();
      }
    }
  };

  /**
   * Called when socket is opened, subscriptions are registered for later reference
   * @param {function} opened_callback - a callback function
   * @return {undefined}
   */
  const handleSocketOpen = function (opened_callback) {
    this.isAlive = true;
    if (Object.keys(Bitkub.subscriptions).length === 0) {
      Bitkub.socketHeartbeatInterval = setInterval(socketHeartbeat, 30000);
    }
    Bitkub.subscriptions[this.endpoint] = this;
    if (typeof opened_callback === 'function') opened_callback(this.endpoint);
  };

  /**
   * Called when socket is closed, subscriptions are de-registered for later reference
   * @param {boolean} reconnect - true or false to reconnect the socket
   * @param {string} code - code associated with the socket
   * @param {string} reason - string with the response
   * @return {undefined}
   */
  const handleSocketClose = function (reconnect, code, reason) {
    delete Bitkub.subscriptions[this.endpoint];
    if (Bitkub.subscriptions && Object.keys(Bitkub.subscriptions).length === 0) {
      clearInterval(Bitkub.socketHeartbeatInterval);
    }
    Bitkub.options.log('Bitkub: WebSocket closed: ' + this.endpoint +
      (code ? ' (' + code + ')' : '') +
      (reason ? ' ' + reason : ''));
    if (Bitkub.options.reconnect && this.reconnect && reconnect) {
      Bitkub.options.log('Bitkub: WebSocket reconnecting: ' + this.endpoint + '...');
      try {
        reconnect();
      } catch (error) {
        Bitkub.options.log('Bitkub: WebSocket reconnect error: ' + error.message);
      }
    }
  };

  /**
   * Called when socket errors
   * @param {object} error - error object message
   * @return {undefined}
   */
  const handleSocketError = function (error) {
    /* Errors ultimately result in a `close` event.
       see: https://github.com/websockets/ws/blob/828194044bf247af852b31c49e2800d557fedeff/lib/websocket.js#L126 */
    Bitkub.options.log('Bitkub: WebSocket error: ' + this.endpoint +
      (error.code ? ' (' + error.code + ')' : '') +
      (error.message ? ' ' + error.message : ''));
  };

  /**
   * Called on each socket heartbeat
   * @return {undefined}
   */
  const handleSocketHeartbeat = function () {
    this.isAlive = true;
  };

  /**
   * Used to subscribe to a single websocket endpoint
   * @param {string} endpoint - endpoint to connect to
   * @param {function} callback - the function to called when information is received
   * @param {boolean} reconnect - whether to reconnect on disconnect
   * @param {object} opened_callback - the function to called when opened
   * @return {WebSocket} - websocket reference
   */
  const subscribe = function (endpoint, callback, reconnect = false, opened_callback = false) {
    let ws = false;
    ws = new WebSocket(stream + endpoint);
    if (Bitkub.options.verbose) Bitkub.options.log('Bitkub: Subscribed to ' + endpoint);
    ws.reconnect = Bitkub.options.reconnect;
    ws.endpoint = endpoint;
    ws.isAlive = false;
    ws.on('open', handleSocketOpen.bind(ws, opened_callback));
    ws.on('pong', handleSocketHeartbeat);
    ws.on('error', handleSocketError);
    ws.on('close', handleSocketClose.bind(ws, reconnect));
    ws.on('message', function (data) {
      try {
        let json = JSON.parse(data);
        if (Bitkub.options.sanitize)
          json.symbol = json.stream.split('_')[1].toUpperCase() + '/THB';
        callback(json);
      } catch (error) {
        Bitkub.options.log('Bitkub: Parse error: ' + error.message);
      }
    });
    return ws;
  };

  /**
   * Used to subscribe to a combined websocket endpoint
   * @param {string} streams - streams to connect to
   * @param {function} callback - the function to called when information is received
   * @param {boolean} reconnect - whether to reconnect on disconnect
   * @param {object} opened_callback - the function to called when opened
   * @return {WebSocket} - websocket reference
   */
  const subscribeCombined = function (streams, callback, reconnect = false, opened_callback = false) {
    const queryParams = streams.join(',');
    let ws = false;
    ws = new WebSocket(stream + queryParams);
    ws.reconnect = Bitkub.options.reconnect;
    ws.endpoint = queryParams;
    ws.isAlive = false;
    if (Bitkub.options.verbose) {
      Bitkub.options.log('CombinedStream: Subscribed to [' + ws.endpoint + ']');
    }
    ws.on('open', handleSocketOpen.bind(ws, opened_callback));
    ws.on('pong', handleSocketHeartbeat);
    ws.on('error', handleSocketError);
    ws.on('close', handleSocketClose.bind(ws, reconnect));
    ws.on('message', function (data) {
      try {
        let json = JSON.parse(data);
        if (Bitkub.options.sanitize)
          json.symbol = json.stream.split('_')[1].toUpperCase() + '/THB';
        callback(json);
      } catch (error) {
        Bitkub.options.log('CombinedStream: Parse error: ' + error.message);
      }
    });
    return ws;
  };

  /**
   * Used to subscribe to a single websocket endpoint
   * @param {string} endpoint - endpoint to connect to
   * @param {function} callback - the function to called when information is received
   * @param {boolean} reconnect - whether to reconnect on disconnect
   * @param {object} opened_callback - the function to called when opened
   * @return {WebSocket} - websocket reference
   */
  const subscribeBook = function (endpoint, callback, reconnect = false, opened_callback = false) {
    let ws = false;
    ws = new WebSocket(stream + endpoint);
    if (Bitkub.options.verbose) Bitkub.options.log('OrderBook: Subscribed to ' + endpoint);
    ws.reconnect = Bitkub.options.reconnect;
    ws.endpoint = endpoint;
    ws.isAlive = false;
    ws.on('open', handleSocketOpen.bind(ws, opened_callback));
    ws.on('pong', handleSocketHeartbeat);
    ws.on('error', handleSocketError);
    ws.on('close', handleSocketClose.bind(ws, reconnect));
    ws.on('message', function (data) {
      try {
        let json = JSON.parse(data);
        if (json.event === 'bidschanged' || json.event === 'askschanged' || json.event === 'tradeschanged')
          callback(json);
        if (!Bitkub.options.ignoreTickers && json.event === 'ticker') {
          //if (Bitkub.options.sanitize && json.data.stream !== undefined)
          //json.data.symbol = json.data.stream.split('_')[1].toUpperCase() + '/THB';
          callback(json);
        }
        if (!Bitkub.options.ignoreGlobalTickers && json.event === 'global.ticker') {
          if (Bitkub.options.sanitize)
            json.data.symbol = json.data.stream.split('_')[1].toUpperCase() + '/THB';
          callback(json);
        }
      } catch (error) {
        Bitkub.options.log('OrderBook: Parse error: ' + error.message);
      }
    });
    return ws;
  };

  /**
   * Used to terminate a web socket
   * @param {string} endpoint - endpoint identifier associated with the web socket
   * @param {boolean} reconnect - auto reconnect after termination
   * @return {undefined}
   */
  const terminate = function (endpoint, reconnect = false) {
    let ws = Bitkub.subscriptions[endpoint];
    if (!ws) return;
    ws.removeAllListeners('message');
    ws.reconnect = reconnect;
    ws.terminate();
  }

  /**
   * Checks whether or not an array contains any duplicate elements
   *  Note(keith1024): at the moment this only works for primitive types,
   *  will require modification to work with objects
   * @param {array} array - the array to check
   * @return {boolean} - true or false
   */
  const isArrayUnique = function (array) {
    let s = new Set(array);
    return s.size === array.length;
  };

  return {

    /**
    * Converts an object to an array
    * @param {object} obj - the object
    * @return {array} - the array
    */
    array: function (obj) {
      return Object.keys(obj).map(function (key) {
        return [Number(key), obj[key]];
      });
    },

    /**
    * Sets an option given a key and value
    * @param {string} key - the key to set
    * @param {object} value - the value of the key
    * @return {undefined}
    */
    setOption: function (key, value) {
      Bitkub.options[key] = value;
    },

    /**
    * Gets an option given a key
    * @param {string} key - the key to set
    * @return {undefined}
    */
    getOption: function (key) {
      return Bitkub.options[key];
    },

    /**
    * Returns the entire options object
    * @return {object} - the options object
    */
    getOptions: function () {
      return Bitkub.options;
    },

    /**
    * Gets an option given a key
    * @param {object} opt - the object with the class configuration
    * @param {function} callback - the callback function
    * @return {undefined}
    */
    options: function (opt, callback = false) {
      if (typeof opt === 'string') { // Pass json config filename
        Bitkub.options = JSON.parse(file.readFileSync(opt));
      } else Bitkub.options = opt;
      if (typeof Bitkub.options.reconnect === 'undefined') Bitkub.options.reconnect = default_options.reconnect;
      if (typeof Bitkub.options.verbose === 'undefined') Bitkub.options.verbose = default_options.verbose;
      if (typeof Bitkub.options.sanitize === 'undefined') Bitkub.options.sanitize = default_options.sanitize;
      if (typeof Bitkub.options.ignoreTickers === 'undefined') Bitkub.options.ignoreTickers = default_options.ignoreTickers;
      if (typeof Bitkub.options.ignoreGlobalTickers === 'undefined') Bitkub.options.ignoreGlobalTickers = default_options.ignoreGlobalTickers;
      if (typeof Bitkub.options.log === 'undefined') Bitkub.options.log = default_options.log;
      if (callback) callback();
      return this;
    },

    websockets: {
      /**
      * Subscribe to a generic websocket
      * @param {string} url - the websocket endpoint
      * @param {function} callback - optional execution callback
      * @param {boolean} reconnect - subscription callback
      * @return {WebSocket} the websocket reference
      */
      subscribe: function (url, callback, reconnect = false) {
        return subscribe(url, callback, reconnect);
      },

      /**
      * Subscribe to a generic combined websocket
      * @param {string} url - the websocket endpoint
      * @param {function} callback - optional execution callback
      * @param {boolean} reconnect - subscription callback
      * @return {WebSocket} the websocket reference
      */
      subscribeCombined: function (url, callback, reconnect = false) {
        return subscribeCombined(url, callback, reconnect);
      },

      /**
      * Subscribe to a generic combined websocket
      * @param {string} url - the websocket endpoint
      * @param {function} callback - optional execution callback
      * @param {boolean} reconnect - subscription callback
      * @return {WebSocket} the websocket reference
      */
      subscribeBook: function (url, callback, reconnect = false) {
        return subscribeCombined(url, callback, reconnect);
      },

      /**
      * Returns the known websockets subscriptions
      * @return {array} array of web socket subscriptions
      */
      subscriptions: function () {
        return Bitkub.subscriptions;
      },

      /**
      * Terminates a web socket
      * @param {string} endpoint - the string associated with the endpoint
      * @return {undefined}
      */
      terminate: function (endpoint) {
        if (Bitkub.options.verbose) Bitkub.options.log('WebSocket terminating:', endpoint);
        return terminate(endpoint);
      },

      /**
      * Websocket tickers
      * @param {array/string} symbols - an array or string of symbols to query
      * @param {function} callback - callback function
      * @return {string} the websocket endpoint
      */
      tickers: function tickers(symbols, callback) {
        let reconnect = function () {
          if (Bitkub.options.reconnect) tickers(symbols, callback);
        };
        let subscription;
        if (Array.isArray(symbols)) {
          if (!isArrayUnique(symbols)) throw Error('tickers: "symbols" cannot contain duplicate elements.');
          let streams = symbols.map(function (symbol) {
            if (Bitkub.options.sanitize)
              return 'market.ticker.' + (symbol.split('/')[1] + '_' + symbol.split('/')[0]).toLowerCase();
            else
              return symbol.toLowerCase();
          });
          subscription = subscribeCombined(streams, callback, reconnect);
        } else {
          let symbol;
          if (Bitkub.options.sanitize)
            symbol = 'market.ticker.' + (symbols.split('/')[1] + '_' + symbols.split('/')[0]);
          else
            symbol = symbols;
          subscription = subscribe(symbol.toLowerCase(), callback, reconnect);
        }
        return subscription.endpoint;
      },

      /**
      * Websocket trades
      * @param {array/string} symbols - an array or string of symbols to query
      * @param {function} callback - callback function
      * @return {string} the websocket endpoint
      */
      trades: function trades(symbols, callback) {
        let reconnect = function () {
          if (Bitkub.options.reconnect) trades(symbols, callback);
        };
        let subscription;
        if (Array.isArray(symbols)) {
          if (!isArrayUnique(symbols)) throw Error('trades: "symbols" cannot contain duplicate elements.');
          let streams = symbols.map(function (symbol) {
            if (Bitkub.options.sanitize)
              return 'market.trade.' + (symbol.split('/')[1] + '_' + symbol.split('/')[0]).toLowerCase();
            else
              return symbol.toLowerCase();
          });
          subscription = subscribeCombined(streams, callback, reconnect);
        } else {
          let symbol;
          if (Bitkub.options.sanitize)
            symbol = 'market.trade.' + (symbols.split('/')[1] + '_' + symbols.split('/')[0]);
          else
            symbol = symbols;
          subscription = subscribe(symbol.toLowerCase(), callback, reconnect);
        }
        return subscription.endpoint;
      },

      /**
      * Websocket live orderbook
      * @param {number} symbolId - a number representing the symbol to query
      * @param {function} callback - callback function
      * @return {string} the websocket endpoint
      */
      book: function book(symbolId, callback) {
        let reconnect = function () {
          if (Bitkub.options.reconnect) book(symbolId, callback);
        };
        let subscription = subscribeBook(symbolId, callback, reconnect);
        return subscription.endpoint;
      },
    }
  };
}
module.exports = api;
