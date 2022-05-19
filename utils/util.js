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

/**
 * 拼接多个Arraybuffer
 * @param  {...any} arrays 任意个Arraybuffer
 */
function concatenate(...arrays) {
  let totalLen = 0;
  for (let arr of arrays)
    totalLen += arr.byteLength;
  let res = new Uint8Array(totalLen)
  let offset = 0
  for (let arr of arrays) {
    let uint8Arr = new Uint8Array(arr)
    res.set(uint8Arr, offset)
    offset += arr.byteLength
  }
  return res.buffer
}

function wordToInt(b0, b1) {
  var temp0 = b0 & 0xFF;
  var temp1 = b1 & 0xFF;
  return ((temp0 << 8) + temp1);
}

module.exports = {
  formatFullTime,
  formatDate,
  formatTime,
  dateToAb,
  getXORValue,
  concatenate,
  wordToInt,
  getDefaultStartDate,
  getDefaultStartTime
}