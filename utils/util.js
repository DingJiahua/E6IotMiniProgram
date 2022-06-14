const BYTE_ORIGINAL = 0x00

const formatFullTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatDate = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  return `${[year, month, day].map(formatNumber).join('-')}`
}

const formatTime = date => {
  const hour = date.getHours()
  const minute = date.getMinutes()
  return `${[hour, minute].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const timestampToBCD = timestamp => {
  const date = new Date(timestamp)
  const year = date.getFullYear() - 2000
  const month = date.getMonth()
  const day = date.getDate() - 5
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return `${[year, month, day, hour, minute, second].map(formatNumber).join('')}`
}

const getRealTimePwd = date => {
  const year = date.getFullYear() - 2000
  const month = date.getMonth() + 1
  const day = date.getDate()

  return String(Number(`${[year, month, day].map(formatNumber).join('')}`) - 16)
}

/**
 * 获取读取数据的起始日期，默认为当前时间往前推1小时
 */
function getDefaultStartDate() {
  var timestamp = Date.parse(new Date());
  timestamp = timestamp - 1 * 60 * 60 * 1000;
  var date = new Date(timestamp);
  return formatDate(date)
}

/**
 * 获取读取数据的起始时间，默认为当前时间往前推1小时
 */
function getDefaultStartTime() {
  var timestamp = Date.parse(new Date());
  timestamp = timestamp - 1 * 60 * 60 * 1000;
  var date = new Date(timestamp);
  return formatTime(date)
}

function dateToAb(date, time) {
  var dateStr = date + " " + time
  const wholeDate = new Date(dateStr)
  const year = wholeDate.getFullYear() - 2000
  const month = wholeDate.getMonth() + 1
  const day = wholeDate.getDate()
  const hour = wholeDate.getHours()
  const minute = wholeDate.getMinutes()
  const buffer = new ArrayBuffer(6)
  var dataView = new DataView(buffer)
  dataView.setUint8(0, year)
  dataView.setUint8(1, month)
  dataView.setUint8(2, day)
  dataView.setUint8(3, hour)
  dataView.setUint8(4, minute)
  dataView.setUint8(5, 0x00)
  return buffer
}

/**
 * 获取异或校验值
 */
function getXORValue(arrayBuffer) {
  var temp = BYTE_ORIGINAL
  for (let i = 0; i < arrayBuffer.byteLength; i++) {
    temp = temp ^ new DataView(arrayBuffer).getUint8(i)
  }
  return temp
}

function getSpecialXORValue(arrayBuffer) {
  var temp = 0x01
  for (let i = 0; i < arrayBuffer.byteLength; i++) {
    temp = temp ^ new DataView(arrayBuffer).getUint8(i)
  }
  return temp
}

/**
 * 拼接多个Arraybuffer
 * @param  {...any} arrays 任意个Arraybuffer
 */
function concatenate(...arrays) {
  let totalLen = 0;
  for (let arr of arrays) {
    if (arr.byteLength != undefined) {
      totalLen += arr.byteLength;
    }
  }
  let res = new Uint8Array(totalLen)
  let offset = 0
  for (let arr of arrays) {
    if (arr.byteLength != undefined) {
      let uint8Arr = new Uint8Array(arr)
      res.set(uint8Arr, offset)
      offset += arr.byteLength
    }
  }
  return res.buffer
}

function concatenateArray(...arrays) {
  let totalLen = 0;
  for (let arr of arrays) {
    if (arr.length != undefined) {
      totalLen += arr.length;
    }
  }
  let res = new Uint8Array(totalLen)
  let offset = 0
  for (let arr of arrays) {
    if (arr.length != undefined) {
      res.set(arr, offset)
      offset += arr.length
    }
  }
  return res
}

function wordToInt(b0, b1) {
  var temp0 = b0 & 0xFF;
  var temp1 = b1 & 0xFF;
  return ((temp0 << 8) + temp1);
}

function hexStrToAB(hex) {
  var typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
    return parseInt(h, 16)
  }))
  return typedArray.buffer
}

function abToHex(buffer) {
  const hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join('')
}

function convertToWord(value) {
  const temp0 = (value & 0x0800) << 4
  const temp1 = value & 0x07FF
  return temp0 + temp1
}

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}

function intToAb(value, size) {
  const buffer = new ArrayBuffer(size)
  const dataView = new DataView(buffer)
  for (var i = 0; i < size; i++) {
    dataView.setUint8(i, (value >> (size - i - 1) * 8) & 0xFF)
  }
  return buffer
}

function ab2hexWithSpace(buffer) {
  const hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join(' ')
}

/**
 * 字符串转为ArrayBuffer对象
 */
function str2ab(str) {
  var buf = new ArrayBuffer(str.length)
  var bufView = new Uint8Array(buf)
  for (var i = 0, strLen = str.length; i < strLen; i++) {
    bufView[i] = str.charCodeAt(i)
  }
  return buf
}

function bytesToFloat(b0, b1) {
  const sign = (b0 & 0x80) == 0x80;
  const value = (((b0 & 0x7F) << 8) + (b1 & 0xFF)) / 10;
  return sign ? -value : value;
}

function signIntToBytes(num) {
  var sign = false;
  if (num < 0) {
    sign = true;
    num = Math.abs(num);
  }
  const buffer = new ArrayBuffer(2)
  const dataView = new DataView(buffer)
  if (sign) {
    dataView.setUint8(0, (num >> 8) | 0x80)
  } else {
    dataView.setUint8(0, (num >> 8) & 0xFF)
  }
  dataView.setUint8(1, num & 0xFF)
  return buffer;
}

function fourBytesToInt(b0, b1, b2, b3) {
  var temp0 = b0 & 0xFF;
  var temp1 = b1 & 0xFF;
  var temp2 = b2 & 0xFF;
  var temp3 = b3 & 0xFF;
  return ((temp0 << 24) + (temp1 << 16) + (temp2 << 8) + temp3);
}

function intToAbLittleEndian(value, size) {
  const buffer = new ArrayBuffer(size)
  const dataView = new DataView(buffer)
  for (var i = 0; i < size; i++) {
    dataView.setUint8(i, (value >> (i * 8)) & 0xFF)
  }
  return buffer
}

module.exports = {
  formatFullTime,
  formatDate,
  formatTime,
  dateToAb,
  getXORValue,
  concatenate,
  concatenateArray,
  wordToInt,
  getDefaultStartDate,
  getDefaultStartTime,
  hexStrToAB,
  abToHex,
  convertToWord,
  ab2str,
  intToAb,
  timestampToBCD,
  getSpecialXORValue,
  ab2hexWithSpace,
  str2ab,
  bytesToFloat,
  signIntToBytes,
  getRealTimePwd,
  fourBytesToInt,
  intToAbLittleEndian
}