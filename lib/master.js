'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.ModbusMaster = undefined;

var _bufferput = require('bufferput');

var _bufferput2 = _interopRequireDefault(_bufferput);

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _serialHelper = require('./serial-helper');

var _logger = require('./logger');

var _constants = require('./constants');

var _errors = require('./errors');

var _packetUtils = require('./packet-utils');

var packetUtils = _interopRequireWildcard(_packetUtils);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ModbusMaster {
    constructor(serialPort, options) {
        serialPort.on('error', function (err) {
            console.error(err);
        });

        this._options = Object.assign({}, {
            responseTimeout: _constants.RESPONSE_TIMEOUT,
            queueTimeout: _constants.QUEUE_TIMEOUT
        }, options || {});

        this.logger = new _logger.Logger(this._options);
        this.serial = _serialHelper.SerialHelperFactory.create(serialPort, this._options);
    }

    /**
     * Modbus function read holding registers
     * @param {number} slave
     * @param {number} start
     * @param {number} length
     * @param {number | function} [dataType] value from DATA_TYPES const or callback
     * @returns {Promise<number[]>}
     */
    readHoldingRegisters(slave, start, length, dataType) {
        var packet = this.createFixedPacket(slave, _constants.FUNCTION_CODES.READ_HOLDING_REGISTERS, start, length);

        return this.request(packet).then(function (buffer) {
            var buf = packetUtils.getDataBuffer(buffer);

            if (typeof dataType === 'function') {
                return dataType(buf);
            }

            return packetUtils.parseFc03Packet(buf, dataType);
        });
    }

    /**
     *
     * @param {number} slave
     * @param {number} register
     * @param {number} value
     * @param {number} [retryCount]
     */
    writeSingleRegister(slave, register, value, retryCount) {
        var _this = this;

        var packet = this.createFixedPacket(slave, _constants.FUNCTION_CODES.WRITE_SINGLE_REGISTER, register, value);
        retryCount = retryCount || _constants.DEFAULT_RETRY_COUNT;

        var performRequest = function performRequest(retry) {
            return new _bluebird2.default(function (resolve, reject) {
                var funcName = 'writeSingleRegister: ';
                var funcId = `Slave ${slave}; Register: ${register}; Value: ${value};` + `Retry ${retryCount + 1 - retry} of ${retryCount}`;

                if (retry <= 0) {
                    throw new _errors.ModbusRetryLimitExceed(funcId);
                }

                _this.logger.info(funcName + 'perform request.' + funcId);

                _this.request(packet).then(resolve).catch(function (err) {
                    _this.logger.info(funcName + err + funcId);

                    return performRequest(--retry).then(resolve).catch(reject);
                });
            });
        };
        return performRequest(retryCount);
    }

    /**
     *
     * @param {number} slave
     * @param {number} start
     * @param {number[]} array
     */
    writeMultipleRegisters(slave, start, array) {
        var packet = this.createVariousPacket(slave, _constants.FUNCTION_CODES.WRITE_MULTIPLE_REGISTERS, start, array);
        return this.request(packet);
    }

    /**
     * Create modbus packet with fixed length
     * @private
     * @param {number} slave
     * @param {number} func
     * @param {number} param
     * @param {number} param2
     * @returns {Buffer}
     */
    createFixedPacket(slave, func, param, param2) {
        return new _bufferput2.default().word8be(slave).word8be(func).word16be(param).word16be(param2).buffer();
    }

    /**
     * Create modbus packet with various length
     * @private
     * @param {number} slave
     * @param {number} func
     * @param {number} start
     * @param {number[]} array
     * @returns {Buffer}
     */
    createVariousPacket(slave, func, start, array) {
        var buf = new _bufferput2.default().word8be(slave).word8be(func).word16be(start).word16be(array.length).word8be(array.length * 2);

        array.forEach(function (value) {
            return buf.word16be(value);
        });

        return buf.buffer();
    }

    /**
     * @private
     * @param {Buffer} buffer
     * @returns {Promise<Buffer>}
     */
    request(buffer) {
        return this.serial.write(packetUtils.addCrc(buffer)).then(function (response) {
            if (!packetUtils.checkCrc(response)) {
                throw new _errors.ModbusCrcError();
            }
            return response;
        });
    }
}
exports.ModbusMaster = ModbusMaster;