// pages/lora-probe/lora-probe.js
import Dialog from '../../miniprogram_npm/@vant/weapp/dialog/dialog';
import Toast from '../../miniprogram_npm/@vant/weapp/toast/toast';

const TX_AUTH_REQ = 0xAACA
const RX_AUTH_RSP = 0xAACB
const TX_PARAM_REQ = 0xAAE1
const RX_PARAM_RSP = 0xAAE2
const RTX_MODIFY_PARAM = 0xAAE3
const RX_TOTAL_PKG_RSP = 0xAAE4
const RX_HISTORY_DATA_RSP = 0xAAE5
const RTX_QUERY_VERSION = 0xAAE6

const TX_REQ_OTA_VERSION = 0xAABA;
const TX_REQ_OTA_UPGRADE = 0xAABB;
const TX_REQ_OTA_RAW = 0xAABC;
const TX_REQ_OTA_END = 0xAABD;

const RX_REQ_OTA_VERSION = 0xAADA;
const RX_REQ_OTA_UPGRADE = 0xAADB;
const RX_REQ_OTA_RAW = 0xAADC;
const RX_REQ_OTA_END = 0xAADD;

const BLE_PASSWORD = 'E6Iot'
const DEFAULT_MTU = 23
const MAX_MTU = 247
const BOOT_AGENT_LENGTH = 1024 * 12
const OTA_MAX_RX_OCTETS = 5
const BOOT_M0_LENGTH = 1024 * 20
const OTA_IMAGE_BLOCK_LENGTH = 240

const HTTP_SUCCESS_CODE = 200

const Util = require('../../utils/util.js')
const Http = require('../../utils/http.js')
const MD5 = require('../../utils/MD5')

function splitPackage(arrayBuffer, mtu) {
  console.log(arrayBuffer)
  var array = new Array()
  const size = mtu - 3
  var loopCount = parseInt(arrayBuffer.byteLength / size) + parseInt(arrayBuffer.byteLength % size === 0 ? 0 : 1)
  for (let i = 0; i < loopCount; i++) {
    let start = i * size
    let end = Math.min(arrayBuffer.byteLength, start + size)
    let arrayTemp = arrayBuffer.slice(start, end)
    array.push(arrayTemp)
  }
  return array
}

function splitOtaFile(arrayBuffer) {
  const cmdId = Util.intToAbLittleEndian(TX_REQ_OTA_RAW, 2)
  var array = new Array()
  var loopCount = parseInt(arrayBuffer.byteLength / OTA_IMAGE_BLOCK_LENGTH) + parseInt(arrayBuffer.byteLength 
    % OTA_IMAGE_BLOCK_LENGTH === 0 ? 0 : 1)
  for (let i = 0; i < loopCount; i++) {
    let start = i * OTA_IMAGE_BLOCK_LENGTH
    let end = Math.min(arrayBuffer.byteLength, start + OTA_IMAGE_BLOCK_LENGTH)
    let arrayTemp = arrayBuffer.slice(start, end)
    const len = Util.intToAbLittleEndian(arrayTemp.byteLength, 2)
    array.push(Util.concatenate(cmdId, len, arrayTemp))
  }
  return array
}

Page({

  /**
   * 页面的初始数据
   */
  data: {
    paramGet: false,
    bleDeviceId: '',
    deviceId: '',
    sensorType: 0,
    samplingInterval: 5,
    returnInterval: 15,
    tempSize: 1,
    lowTemp: 0,
    highTemp: 0,
    alarm: 0,
    loraPower: 0,
    loraVersion: '',
    totalPkg: 0,
    pkgCount: 0,
    cachePkgCount: 0,
    cachePkg: new ArrayBuffer(),
    receivePkg: new ArrayBuffer(),
    dataArray: [],
    index: 0,
    lastDataTimestamp: 0,
    sensorCount: 0,
    uploadPkgArray: [],
    retryTimes: 0,
    timer: 0,
    bleTimer: 1,
    mulitPkg: false,
    cacheMulitPkg: new ArrayBuffer(),
    authPass: false,
    mtu: DEFAULT_MTU,
    pkgArray: [],
    txIndex: 0,
    isOta: false,
    otaBlockIndex: 0,
    otaBlockArray:[],
    isOtaStarted: false,
    isOtaPaused: false,
    rxOctetsIndex: 0,
    otaProgress: 0,
    otaTimer: 2,
    taskUuid: '',
    firmwareMd5: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    this.data.bleDeviceId = options.deviceId
    this.createBleConnection(options.deviceId)
  },

  createBleConnection(deviceId) {
    wx.showLoading({
      title: '正在连接设备',
    })
    wx.createBLEConnection({
      deviceId: deviceId,
      timeout: 15000,
      success: (res) => {
        wx.hideLoading()
        wx.showToast({
          title: '连接成功',
        })
        this.getBLEDeviceServices(deviceId)
      },
      fail: (res) => {
        wx.hideLoading()
        wx.showToast({
          title: '连接失败',
        })
      },
    })
  },

  getBLEDeviceServices(deviceId) {
    wx.setBLEMTU({
      deviceId: deviceId,
      mtu: MAX_MTU,
      complete: (res) => {
        wx.getBLEDeviceServices({
          deviceId: deviceId,
          success: (result) => {
            for (let i = 0; i < result.services.length; i++) {
              if (result.services[i].isPrimary) {
                this.getBLEDeviceCharacteristics(deviceId, result.services[i].uuid)
                return
              }
            }
          },
        })
      }
    })
  },

  getBLEDeviceCharacteristics(deviceId, serviceUuid) {
    wx.getBLEDeviceCharacteristics({
      deviceId: deviceId,
      serviceId: serviceUuid,
      success: (result) => {
        for (let i = 0; i < result.characteristics.length; i++) {
          const item = result.characteristics[i]
          if (item.properties.read) {
            wx.readBLECharacteristicValue({
              characteristicId: item.uuid,
              deviceId: deviceId,
              serviceId: serviceUuid,
            })
          }

          if (item.properties.notify || item.properties.indicate) {
            wx.notifyBLECharacteristicValueChange({
              characteristicId: item.uuid,
              deviceId: deviceId,
              serviceId: serviceUuid,
              state: true,
              success(res) {
                console.log('notifyBLECharacteristicValueChange success', res.errMsg)
              },
              fail(res) {
                console.log('notifyBLECharacteristicValueChange fail', res.errMsg)
              }
            })
          }

          if (item.properties.write) {
            console.error(item.uuid)
            this._deviceId = deviceId
            this._serviceId = serviceUuid
            this._characteristicId = item.uuid
            this.sendAuthData()
          }
        }
      },
      fail: (res) => {
        console.error('getBLEDeviceCharacteristics', res)
      }
    })
    wx.onBLECharacteristicValueChange((characteristic) => {
      clearTimeout(this.data.bleTimer)
      var buffer = characteristic.value
      console.log('received = ' + Util.abToHex(buffer))
      if (!this.data.authPass) {
        const receive = new Uint8Array(buffer)
        const cmdId = Util.wordToInt(receive[0], receive[1])
        const checkSum = Util.getSpecialXORValue(buffer.slice(0, buffer.byteLength - 1))
        if (cmdId == RX_AUTH_RSP && checkSum == receive[receive.byteLength - 1]) {
          if (receive[3] == 0xAA) {
            this.data.authPass = true
            this.requestDeviceParam()
          } else {
            this.data.authPass = false
            wx.showToast({
              title: '鉴权失败',
              icon: 'none'
            })
          }
        } else {
          this.data.authPass = false
          wx.showToast({
            title: '鉴权失败',
            icon: 'none'
          })
        }
        return
      }
      var receive
      var len
      if (this.data.mulitPkg) {
        buffer = Util.concatenate(this.data.cacheMulitPkg, buffer)
        receive = new Uint8Array(buffer)
        if(this.data.isOta) {
          len = Util.wordToInt(receive[2, receive[3]])
        } else {
          len = receive[2]
        }
        if (buffer.byteLength < (len + 4)) {
          this.setData({
            cacheMulitPkg: buffer
          })
          return
        } else if (buffer.byteLength > (len + 4)) {
          this.setData({
            cachePkgCount: 0,
            cachePkg: new ArrayBuffer()
          })
          wx.showToast({
            title: '数据解析出错，请重试',
            icon: 'none'
          })
          return
        } else {
          this.setData({
            mulitPkg: false,
            cacheMulitPkg: new ArrayBuffer()
          })
        }
      } else {
        receive = new Uint8Array(buffer)
        if(this.data.isOta) {
          len = Util.wordToInt(receive[2], receive[3])
        } else {
          len = receive[2]
        }
        if (buffer.byteLength < (len + 4)) {
          this.setData({
            mulitPkg: true,
            cacheMulitPkg: buffer
          })
          return
        } else if (buffer.byteLength > (len + 4)) {
          this.setData({
            cachePkgCount: 0,
            cachePkg: new ArrayBuffer()
          })
          wx.showToast({
            title: '数据解析出错，请重试',
            icon: 'none'
          })
          return
        }
      }
      const cmdId = Util.wordToInt(receive[0], receive[1])
      const checkSum = Util.getSpecialXORValue(buffer.slice(0, buffer.byteLength - 1))
      switch (cmdId) {
        case RX_PARAM_RSP:
          if (checkSum == receive[receive.byteLength - 1]) {
            const deviceId = Util.abToHex(buffer.slice(3, 9)).slice(1)
            console.log('deviceId = ' + deviceId)
            const sensorType = receive[9]
            const samplingInterval = receive[10]
            const returnInterval = receive[11]
            const tempSize = receive[12]
            const lowTemp = Util.bytesToFloat(receive[13], receive[14])
            const highTemp = Util.bytesToFloat(receive[15], receive[16])
            const alarm = receive[17]
            const loraPower = receive[18]
            this.setData({
              paramGet: true,
              deviceId: deviceId,
              sensorType: sensorType,
              samplingInterval: samplingInterval,
              returnInterval: returnInterval,
              tempSize: tempSize,
              lowTemp: lowTemp,
              highTemp: highTemp,
              alarm: alarm,
              loraPower: loraPower
            })
            this.queryLoraVersion()
          } else {
            wx.showToast({
              title: '参数读取失败，请返回尝试重新连接',
              icon: 'none'
            })
          }
          break
        case RTX_MODIFY_PARAM:
          if (checkSum == receive[receive.byteLength - 1]) {
            if (receive[3] == 0xAA) {
              this.modal.hideModal();
              wx.showToast({
                title: '参数配置成功',
              })
            } else {
              wx.showToast({
                title: '参数配置失败',
              })
            }
          } else {
            wx.showToast({
              title: '参数配置失败',
            })
          }
          break
        case RX_TOTAL_PKG_RSP:
          if (checkSum == receive[receive.byteLength - 1]) {
            this.setBleTimer()
            this.data.totalPkg = Util.wordToInt(receive[3], receive[4])
            console.log('totalPkg = ' + this.data.totalPkg)
          } else {
            wx.hideLoading()
            wx.showToast({
              title: '数据读取失败',
              icon: 'none'
            })
          }
          break
        case RX_HISTORY_DATA_RSP:
          if (checkSum == receive[receive.byteLength - 1]) {
            const dataPkgSerial = receive[3]
            if ((this.data.cachePkgCount) == dataPkgSerial) {
              const data = buffer.slice(4, buffer.byteLength - 1)
              console.log('data = ' + Util.abToHex(data))
              this.setData({
                cachePkgCount: this.data.cachePkgCount + 1,
                cachePkg: Util.concatenate(this.data.cachePkg, data)
              })
              if ((this.data.pkgCount + this.data.cachePkgCount) == this.data.totalPkg) {
                this.replyAck(true)
                this.setData({
                  receivePkg: Util.concatenate(this.data.receivePkg, this.data.cachePkg)
                })
                this.buildUploadPkg()
              } else {
                // 每20包回复ACK
                console.log('cachePkgCount = ' + this.data.cachePkgCount)
                if (this.data.cachePkgCount == 20) {
                  this.setData({
                    pkgCount: this.data.pkgCount + 20,
                    receivePkg: Util.concatenate(this.data.receivePkg, this.data.cachePkg),
                    cachePkgCount: 0,
                  })
                  this.data.cachePkg = new ArrayBuffer()
                  this.replyAck(true)
                }
              }
            } else {
              this.setData({
                cachePkgCount: 0,
                cachePkg: new ArrayBuffer()
              })
              this.replyAck(false)
            }
          }
          break
        case RTX_QUERY_VERSION:
          if (checkSum == receive[receive.byteLength - 1]) {
            this.setData({
              loraVersion: Util.ab2str(buffer.slice(3, buffer.byteLength - 1))
            })
            this.uploadDeviceParam()
          }
          break
        case RX_REQ_OTA_UPGRADE:
          clearTimeout(this.data.otaTimer)
          if(receive[4] == 0) {
            this.setData({
              isOtaStarted: true,
              isOtaPaused: false,
              otaBlockIndex: 0,
              rxOctetsIndex: 0
            })
            this.setOtaTimer(30)
            this.otaSend();
          } else {
            // 升级失败
            wx.showToast({
              title: '升级失败',
              icon: 'none'
            })
            this.setData({
              isOta: false,
              isOtaStarted: false
            })
            this.uploadUpgradeResult(false)
          }
          break
        case RX_REQ_OTA_RAW:
          clearTimeout(this.data.otaTimer)
          this.setData({
            isOtaPaused: false,
            rxOctetsIndex: 0
          })
          this.setOtaTimer(30)
          this.otaSend()
          break
        case RX_REQ_OTA_END:
          clearTimeout(this.data.otaTimer)
          this.progressModal.hideModal()
          this.setData({
            isOta: false,
            isOtaStarted: false
          })
          if(receive[4] == 0) {
            this.setData({
              isOtaStarted: false,
            })
            // 升级成功
            console.log('升级成功')
            wx.showToast({
              title: '升级成功',
              icon: 'none'
            })
            this.uploadUpgradeResult(true)
          } else {
            // 升级失败
            console.log('升级失败')
            wx.showToast({
              title: '升级失败',
              icon: 'none'
            })
            this.uploadUpgradeResult(false)
          }
          break  
        default:
          break
      }
    })
  },

  replyAck(success) {
    const msgId = Util.intToAb(RX_HISTORY_DATA_RSP, 2)
    const len = Util.intToAb(1, 1)
    const result = success ? Util.hexStrToAB('AA') : Util.hexStrToAB('AB')
    const checkSum = Util.intToAb(Util.getSpecialXORValue(Util.concatenate(msgId, len, result)), 1)
    this.write(Util.concatenate(msgId, len, result, checkSum))
  },

  setBleTimer() {
    this.data.bleTimer = setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '读取数据超时',
      })
    }, 10 * 1000);
  },

  setOtaTimer(second) {
    this.data.otaTimer = setTimeout(() => {
      this.progressModal.hideModal()
      wx.showToast({
        title: '升级失败（超时）',
        icon: 'none'
      })
      this.uploadUpgradeResult(false)
    }, second * 1000);
  },

  uploadDeviceParam() {
    wx.request({
      url: Http.BASE_HTTP_DOMAIN + Http.HTTP_UPLOAD_RAMAM,
      method: 'GET',
      data: {
        deviceId: this.data.deviceId,
        versionInfo: this.data.loraVersion,
        sensorType: this.data.sensorType,
        sampleInterval: this.data.samplingInterval,
        uploadInterval: this.data.returnInterval,
        channelCounts: this.data.tempSize,
        temMin: this.data.lowTemp * 10,
        temMax: this.data.highTemp * 10,
        alarmSwitch: this.data.alarm,
        loraDb: this.data.loraPower
      },
      success(res) {
        console.log(res)
      },
      fail(res) {
        console.log(res)
      }
    })
  },

  uploadUpgradeResult(upgradeResult) {
    wx.request({
      url: Http.BASE_HTTP_DOMAIN + Http.HTTP_POST_UPGRADE_RESULT,
      method: 'GET',
      data: {
        uuid: this.data.taskUuid,
        status: upgradeResult ? 1 : 0
      },
      success(res) {
        console.log(res)
      },
      fail(res) {
        console.log(res)
      }
    })
  },

  requestHistoryData() {
    if (!this.data.paramGet) {
      wx.showToast({
        title: '参数读取失败，请返回尝试重新连接',
        icon: 'none'
      })
      return
    }
    wx.showLoading({
      title: '正在提取数据',
    })
    this.setData({
      cachePkgCount: 0,
      cachePkg: new ArrayBuffer(),
      pkgCount: 0,
      receivePkg: new ArrayBuffer()
    })
    wx.setBLEMTU({
      deviceId: this.data.bleDeviceId,
      mtu: DEFAULT_MTU,
      complete: () => {
        this.setBleTimer()
        this.data.lastDataTimestamp = Date.parse(new Date())
        const buffer = Util.intToAb(RX_TOTAL_PKG_RSP, 2)
        const len = Util.intToAb(1, 1)
        const day = Util.intToAb(3, 1)
        const checkCode = new ArrayBuffer(1)
        var dataView = new DataView(checkCode)
        dataView.setUint8(0, Util.getSpecialXORValue(Util.concatenate(buffer, len, day)))
        const data = Util.concatenate(buffer, len, day, checkCode)
        this.write(data)
      }
    })
  },

  queryDeviceVersion() {
    const cmdId = Util.intToAbLittleEndian(TX_REQ_OTA_VERSION, 2)
    const len = Util.intToAbLittleEndian(0, 2)
    this.write(Util.concatenate(cmdId, len))
  },

  queryLoraVersion() {
    const buffer = Util.intToAb(RTX_QUERY_VERSION, 2)
    const len = Util.intToAb(0, 1)
    const checkCode = new ArrayBuffer(1)
    var dataView = new DataView(checkCode)
    dataView.setUint8(0, Util.getSpecialXORValue(Util.concatenate(buffer, len)))
    const data = Util.concatenate(buffer, len, checkCode)
    this.write(data)
  },

  /**
   * 根据设备参数拼接透传数据包
   */
  buildUploadPkg() {
    console.log('receivePkg = ' + this.data.receivePkg.byteLength)
    const wholeData = new Uint8Array(this.data.receivePkg)
    for (var i = 0; i < wholeData.byteLength; i += 3) {
      const data1 = ((wholeData[i] & 0xFF) << 4) + ((wholeData[i + 1] & 0xF0) >> 4)
      const data2 = ((wholeData[i + 1] & 0x0F) << 8) + (wholeData[i + 2] & 0xFF)
      this.data.dataArray.push(Util.convertToWord(data1))
      this.data.dataArray.push(Util.convertToWord(data2))
    }
    switch (this.data.sensorType) {
      case 0:
        this.data.sensorCount = this.data.tempSize
        break
      case 1:
        this.data.sensorCount = 2
        break
    }
    const totalPkgNum = this.data.dataArray.length / this.data.sensorCount
    const flag = Util.hexStrToAB("7E")
    for (var i = 0; i < totalPkgNum; i++) {
      const body = this.buildMsgBody(i)
      const header = this.buildMsgHeader(body.byteLength, i)
      const headerBody = Util.concatenate(header, body)
      const checkSum = Util.getXORValue(headerBody)
      const msg = Util.concatenate(headerBody, Util.intToAb(checkSum, 1))
      const msgData = Util.hexStrToAB(Util.ab2hexWithSpace(msg).replace(/ 7d/g, ' 7d 01').replace(/ 7e/g, ' 7d 02').replace(/ /g, ''))
      this.data.uploadPkgArray.push(Util.concatenate(flag, msgData, flag))
    }
    // for (var i = 0; i < this.data.uploadPkgArray.length; i++) {
    //   console.log('uploaddata[' + i + '] = ' + Util.abToHex(this.data.uploadPkgArray[i]))
    // }
    this.openTcp()
  },

  buildMsgBody(index) {
    const timestamp = this.data.lastDataTimestamp - index * (this.data.samplingInterval * 60 * 1000)
    // 时间BCD码
    const timeBuffer = Util.hexStrToAB(Util.timestampToBCD(timestamp))
    // 经纬度 
    const lon = Util.intToAb(0 * 1000000, 4)
    const lat = Util.intToAb(0 * 1000000, 4)
    // 传感器数量
    const sensorCount = Util.intToAb(this.data.sensorCount, 2)
    var dataBuffer = new ArrayBuffer();
    if (this.data.sensorCount == 1) {
      const deviceSerial = Util.intToAb(1, 1)
      const sensorSerial = Util.intToAb(1, 1)
      const dataType = Util.intToAb(1, 1)
      const dataLen = Util.intToAb(2, 1)
      const data = Util.intToAb(this.data.dataArray[index], 2)
      dataBuffer = Util.concatenate(deviceSerial, sensorSerial, dataType, dataLen, data)
    } else {
      if (this.data.sensorType == 0) {
        const deviceSerial1 = Util.intToAb(1, 1)
        const sensorSerial1 = Util.intToAb(1, 1)
        const dataType1 = Util.intToAb(1, 1)
        const dataLen1 = Util.intToAb(2, 1)
        const data1 = Util.intToAb(dataArray[2 * index], 2)
        const deviceSerial2 = Util.intToAb(2, 1)
        const sensorSerial2 = Util.intToAb(1, 1)
        const dataType2 = Util.intToAb(0xF3, 1)
        const dataLen2 = Util.intToAb(2, 1)
        const data2 = Util.intToAb(dataArray[2 * index + 1], 2)
        dataBuffer = Util.concatenate(deviceSerial1, sensorSerial1, dataType1, dataLen1, data1, deviceSerial2, sensorSerial2, dataType2, dataLen2, data2)
      } else if (this.data.sensorType == 1) {
        const deviceSerial1 = Util.intToAb(1, 1)
        const sensorSerial1 = Util.intToAb(1, 1)
        const dataType1 = Util.intToAb(1, 1)
        const dataLen1 = Util.intToAb(2, 1)
        const data1 = Util.intToAb(dataArray[2 * index], 2)
        const deviceSerial2 = Util.intToAb(2, 1)
        const sensorSerial2 = Util.intToAb(1, 1)
        const dataType2 = Util.intToAb(2, 1)
        const dataLen2 = Util.intToAb(2, 1)
        const data2 = Util.intToAb(dataArray[2 * index + 1], 2)
        dataBuffer = Util.concatenate(deviceSerial1, sensorSerial1, dataType1, dataLen1, data1, deviceSerial2, sensorSerial2, dataType2, dataLen2, data2)
      }
    }
    const sensorData = Util.concatenate(timeBuffer, lon, lat, sensorCount, dataBuffer)
    const sensorDataLen = Util.intToAb(sensorData.byteLength + 2, 2)
    const msgBody = Util.concatenate(sensorDataLen, sensorData)
    const msgCount = Util.intToAb(1, 1)
    const msgLen = Util.intToAb(msgBody.byteLength + 3, 2)
    return Util.concatenate(msgLen, msgCount, msgBody)
  },

  buildMsgHeader(len, index) {
    const msgId = Util.intToAb(0x0B00, 2)
    const msgAttr = Util.intToAb(len & 0x03FF, 2)
    const deviceIdBuffer = new ArrayBuffer(20)
    var dataView = new DataView(deviceIdBuffer)
    for (var i = 0; i < 20; i++) {
      if (i < this.data.deviceId.length) {
        var str = this.data.deviceId.charAt(i);
        var code = str.charCodeAt();
        dataView.setUint8(i, code)
      } else {
        dataView.setUint8(i, 0x00)
      }
    }
    const pkgSerial = Util.intToAb(index, 2)
    return Util.concatenate(msgId, msgAttr, deviceIdBuffer, pkgSerial)
  },

  openTcp() {
    wx.hideLoading()
    this._toast = Toast.loading({
      duration: 0, // 持续展示 toast
      forbidClick: true,
      message: '正在上传数据（0/' + this.data.uploadPkgArray.length + ')',
      selector: '#upload-progress',
    });
    this._tcp = wx.createTCPSocket()
    const tcp = this._tcp
    var that = this
    tcp.onConnect(function (res) {
      console.log('connect success')
      that.uploadData()
    })
    tcp.onError(function (res) {
      console.log(res)
      wx.hideLoading()
      wx.showToast({
        title: '服务器连接错误，请重试',
        icon: 'none'
      })
    })
    tcp.connect({
      address: 'etw01.tptri.cn',
      port: 20007
    })
    tcp.onMessage(function (res) {
      clearTimeout(that.data.timer)
      console.log('msg = ' + Util.abToHex(res.message))
      const data = res.message.slice(1, res.message.byteLength - 2)
      const hexStr = Util.ab2hexWithSpace(data);
      const realData = Util.hexStrToAB(hexStr.replace(/ 7d 02/g, ' 7e').replace(/ 7d 01/g, ' 7d').replace(/ /g, ''))
      const checkCode = new Uint8Array(res.message)[res.message.byteLength - 2]
      const sumCode = Util.getSpecialXORValue(realData)
      const realDataNum = new Uint8Array(realData)
      const msgId = Util.wordToInt(realDataNum[0], realDataNum[1])
      const result = realDataNum[realData.byteLength - 1]
      if (checkCode === sumCode && msgId === 0x8001 && result === 0x00) {
        that.data.index++
        that.data.retryTimes = 0
        that.uploadData()
      } else {
        if (that.data.retryTimes >= 2) {
          that.data.index++
          that.data.retryTimes = 0
        } else {
          that.data.retryTimes++
        }
        that.uploadData()
      }
    })
    tcp.onClose(function (res) {
      console.log('close = ' + res.errMsg)
    })
  },

  uploadData() {
    if (this.data.index >= this.data.uploadPkgArray.length) {
      this.setData({
        index: 0,
        uploadPkgArray: [],
        dataArray: []
      })
      Toast.clear()
      wx.showToast({
        title: '上传完毕',
      })
      return
    }
    const data = this.data.uploadPkgArray[this.data.index]
    console.log('tcp data = ' + Util.abToHex(data))
    this._toast.setData({
      message: `正在上传数据（${this.data.index} / ${this.data.uploadPkgArray.length}）`
    })
    var that = this
    this.data.timer = setTimeout(function () {
      if (that.data.retryTimes >= 2) {
        that.data.index++
        that.data.retryTimes = 0
      } else {
        that.data.retryTimes++
      }
      that.uploadData()
    }, 10 * 1000)
    this._tcp.write(data)
  },

  requestDeviceParam() {
    const buffer = Util.intToAb(TX_PARAM_REQ, 2)
    const len = Util.intToAb(0, 1)
    const checkCode = new ArrayBuffer(1)
    var dataView = new DataView(checkCode)
    dataView.setUint8(0, Util.getSpecialXORValue(Util.concatenate(buffer, len)))
    const data = Util.concatenate(buffer, len, checkCode)
    this.write(data)
  },

  sendAuthData() {
    const cmdId = Util.intToAb(TX_AUTH_REQ, 2)
    const data = Util.str2ab(BLE_PASSWORD)
    const checkCode = new ArrayBuffer(1)
    var dataView = new DataView(checkCode)
    dataView.setUint8(0, Util.getSpecialXORValue(Util.concatenate(cmdId, data)))
    const authData = Util.concatenate(cmdId, data, checkCode)
    this.write(authData)
  },

  configParam() {
    this.modal.showModal()
  },

  _onShowModal: function (e) {
    this.modal.showModal();
  },

  _confirmEventFirst: function (e) {
    console.log("点击确定了!" + e.detail.deviceId + " " + e.detail.returnInterval + " " + e.detail.alarm + " " + e.detail.lowTemp + " " + e.detail.highTemp);
    const cmdId = Util.intToAb(RTX_MODIFY_PARAM, 2)
    const len = Util.intToAb(0x10, 1)
    const deviceId = Util.hexStrToAB('0' + e.detail.deviceId)
    const sensorType = Util.intToAb(this.data.sensorType, 1)
    const adcInterval = Util.intToAb(this.data.samplingInterval, 1)
    const returnInterval = Util.intToAb(e.detail.returnInterval, 1)
    const sensorNum = Util.intToAb(this.data.sensorCount, 1)
    const lowTemp = Util.signIntToBytes(e.detail.lowTemp * 10)
    const highTemp = Util.signIntToBytes(e.detail.highTemp * 10)
    const alarm = Util.intToAb(e.detail.alarm ? 1 : 0, 1)
    const loraPower = Util.intToAb(this.data.loraPower, 1)
    const data = Util.concatenate(cmdId, len, deviceId, sensorType, adcInterval, returnInterval, sensorNum, lowTemp, highTemp, alarm, loraPower)
    const checkCode = new ArrayBuffer(1)
    var dataView = new DataView(checkCode)
    dataView.setUint8(0, Util.getSpecialXORValue(data))
    const finalData = Util.concatenate(data, checkCode)
    console.log('finalData = ' + Util.abToHex(finalData))
    this.write(finalData)
  },

  _cancelEvent: function () {
    console.log("点击取消!");
  },

  write(buffer) {
    console.log('write = ' + Util.abToHex(buffer))
    wx.writeBLECharacteristicValue({
      characteristicId: this._characteristicId,
      deviceId: this._deviceId,
      serviceId: this._serviceId,
      value: buffer
    })
  },

  showUpgradeDialog() {
    var that = this
    Dialog.confirm({
      title: '设备升级',
      message: '请选择升级方式',
      cancelButtonText: '本地升级',
      confirmButtonText: '在线升级',
      selector: "#upgrade-dialog"
    }).then(() => {
      wx.showLoading({
        title: '正在检测更新',
      })
      wx.request({
        url: Http.BASE_HTTP_DOMAIN + Http.HTTP_QUERY_UPGRADE,
        method: "GET",
        data: {
          deviceId: this.data.deviceId,
          deviceType: 1,
          deviceVersion: 1
        },
        success(res) {
          console.log(res)
          if(res.data.code == HTTP_SUCCESS_CODE) {
              if (res.data.data == null) {
                wx.hideLoading()
                wx.showToast({
                  title: '未检测到更新',
                  icon: 'none'
                })
              } else {
                console.log(res.data.data.firmwareUrl)
                wx.showLoading({
                  title: '正在下载安装包',
                })
                that.setData({
                  taskUuid: res.data.data.taskUUID,
                  firmwareMd5: res.data.data.firmwareMd5
                }) 
                wx.downloadFile({
                  url: res.data.data.firmwareUrl,
                  filePath: `${wx.env.USER_DATA_PATH}/lora_boot_image.bin`,
                  success(res) {
                    console.log(res)
                    wx.hideLoading()
                    that.requestUpgrade(res.filePath, true)
                  },
                  fail(res) {
                    wx.hideLoading()
                    wx.showToast({
                      title: res.data.msg,
                      icon: 'none'
                    })
                  }
                })
              }
          } else {
            wx.hideLoading()
            wx.showToast({
              title: res.data.msg,
              icon: 'none'
            })
          }
        },
        fail(res) {
          console.log(res)
          wx.hideLoading()
          wx.showToast({
            title: '无法连接到服务器',
            icon: 'none'
          })
        }
      })
    }).catch(() => {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['bin'],
        success(res) {
          that.requestUpgrade(res.tempFiles[0].path, false)
        },
        fail(res) {
          console.log(res)
        }
      })
    });
  },

  requestUpgrade(filePath, checkMd5) {
    wx.setBLEMTU({
      deviceId: this.data.bleDeviceId,
      mtu: MAX_MTU,
      complete: (res) => {
        console.log("mtu = " + res.mtu)
        if (res.mtu == MAX_MTU) {
          this.data.mtu = MAX_MTU
        } else {
          this.data.mtu = DEFAULT_MTU
        }
        const fs = wx.getFileSystemManager()
        var that = this
        fs.readFile({
          //filePath: `${wx.env.USER_DATA_PATH}/lora_boot_image.bin`,
          filePath: filePath,
          position: 0,
          success(res) {
            const buffer = res.data
            if (checkMd5) {
              let spark = new MD5.ArrayBuffer();
              spark.append(buffer);
              let md5 = spark.end(false);
              if (md5 != that.data.firmwareMd5) {
                wx.showToast({
                  title: '升级文件已损坏，请重试',
                  icon: 'none'
                })
                that.uploadUpgradeResult(false)
                return
              }
            }
            var array = new Uint8Array(buffer)
            const header = array.slice(BOOT_AGENT_LENGTH, BOOT_AGENT_LENGTH + 24)
            const fwId = Util.wordToInt(header[9], header[8])
            const imageSize = Util.fourBytesToInt(header[15], header[14], header[13], header[12])
            console.log("fwId = " + fwId + " imageSize = " + imageSize + " fileLen = " + array.length)
            if (imageSize != (array.length - BOOT_M0_LENGTH)) {
              wx.showToast({
                title: '升级文件已损坏，请重试',
                icon: 'none'
              })
            } else {
              that.data.otaBlockArray = splitOtaFile(buffer.slice(BOOT_M0_LENGTH))
              that.otaStart(header.buffer)
            }
          },
          fail(res) {
            console.log(res)
            wx.showToast({
              title: '读取升级文件失败',
              icon: 'none'
            })
          }
        })
      }
    })
  },

  otaStart(header) {
    this.progressModal.showModal()
    this.data.isOta = true
    console.log("header = " + Util.abToHex(header))
    const cmdId = Util.intToAbLittleEndian(TX_REQ_OTA_UPGRADE, 2)
    const len = Util.intToAbLittleEndian(26, 2)
    const maxRxOctets = Util.intToAbLittleEndian(OTA_MAX_RX_OCTETS, 2)
    const startData = Util.concatenate(cmdId, len, maxRxOctets, header)
    this.data.pkgArray = splitPackage(startData, this.data.mtu)
    this.setOtaTimer(10)
    this.writeMultiPkg()
  },

  otaSend() {
    if (this.data.otaBlockIndex >= this.data.otaBlockArray.length) {
      this.setData({
        isOtaStarted: false,
        otaProgress: 100
      })
      this.otaEnd()
      console.log("ota end")
    } else {
      const buffer = this.data.otaBlockArray[this.data.otaBlockIndex]
      console.log("otaBlockArray[" + this.data.otaBlockIndex + '] = ' + Util.abToHex(buffer))
      this.setData({
        pkgArray: splitPackage(buffer, this.data.mtu),
        txIndex: 0,
        otaProgress: Number(((this.data.otaBlockIndex / this.data.otaBlockArray.length) * 100).toFixed(1))
      })
      this.writeMultiPkg()
      this.setData({
        isOtaStarted: true,
        otaBlockIndex: this.data.otaBlockIndex + 1,
        rxOctetsIndex: this.data.rxOctetsIndex + 1
      })
      if (this.data.rxOctetsIndex == OTA_MAX_RX_OCTETS) {
        this.data.isOtaPaused = true;
      }
    }
  },

  otaEnd() {
    const cmdId = Util.intToAbLittleEndian(TX_REQ_OTA_END, 2)
    const len = Util.intToAbLittleEndian(1, 2)
    const data = Util.intToAb(0, 1)
    this.write(Util.concatenate(cmdId, len, data))
  },

  writeMultiPkg() {
    const buffer = this.data.pkgArray[this.data.txIndex]
    console.log("sendbuffer = " + Util.abToHex(buffer))
    var that = this
    wx.writeBLECharacteristicValue({
      characteristicId: this._characteristicId,
      deviceId: this._deviceId,
      serviceId: this._serviceId,
      value: buffer,
      success(res) {
        that.data.txIndex++
        if (that.data.txIndex >= that.data.pkgArray.length) {
          that.setData({
            pkgArray: [],
            txIndex: 0
          })
          if (that.data.isOtaStarted) {
            if (!that.data.isOtaPaused) {
              that.otaSend();
            }
          }
        } else {
          that.writeMultiPkg()
        }
      }
    })
  },

  closeTcp() {
    if (null != this._tcp) {
      this._tcp.close()
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    this.modal = this.selectComponent("#modal")
    this.progressModal = this.selectComponent("#progress_modal")
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {

  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    this.closeTcp()
    wx.closeBLEConnection({
      deviceId: this.data.bleDeviceId,
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {

  }
})