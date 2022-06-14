// pages/portable_th/portable_th.js
import Dialog from '../../miniprogram_npm/@vant/weapp/dialog/dialog';

const FRAME_SINGLE = 0x00
const FRAME_FIRST = 0x01
const FRAME_MULTI = 0x02
const FRAME_CONTROL = 0x04

const FS_CTS = 0x00 // 继续发送
const FS_WAIT = 0x01 // 等待
const FS_OVER_FLOW = 0x02 // 缓存溢出

const MAX_SEND_INTERVAL = 1270 // 最大发送间隔 ms
const MAX_SINGLE_LEN = 19 // 单包最大数据长度

const RTX_COMMON_RSP = 0x00 // 通用应答
const TX_SET_PARAM = 0x01 // 设置参数
const RTX_READ_PARAM = 0x02 // 读取参数
const RTX_HISTORY_DATA = 0x03 // 查询历史数据
const TX_REQ_OTA = 0x04 // 请求OTA 升级信息
const RTX_OTA_RAW = 0x05 // 固件下发

const COMMON_SUCCESS_CODE = 0x00 // 通用成功回码

const PARAM_ID_DEVICE_ID = 0x01 // 参数ID - 中心识别码
const PARAM_ID_WIFI_SSID = 0x02 // 参数ID - wifi ssid
const PARAM_ID_WIFI_PWD = 0x03 // 参数ID - wifi 密码
const PARAM_ID_WORK_TEMP = 0x04 // 参数ID - 工作温度上下限
const PARAM_ID_IP = 0x05 // 参数ID - IP域名

const BOOT_AGENT_LENGTH = 1024 * 12
const BOOT_M0_LENGTH = 1024 * 20
const OTA_IMAGE_BLOCK_LENGTH = 240

const DEFAULT_IP = '47.113.6.172:22414' // 默认IP
const DEFAULT_DOMAIN = '47.113.6.172:22414' // 默认域名

//延时
function sleep(numberMillis) {
  var now = new Date();
  var exitTime = now.getTime() + numberMillis;
  while (true) {
    now = new Date();
    if (now.getTime() > exitTime)
      return;
  }
}

function splitOtaFile(arrayBuffer) {
  const cmdId = Util.intToAb(RTX_OTA_RAW, 1)
  var array = new Array()
  var loopCount = parseInt(arrayBuffer.byteLength / OTA_IMAGE_BLOCK_LENGTH) + parseInt(arrayBuffer.byteLength %
    OTA_IMAGE_BLOCK_LENGTH === 0 ? 0 : 1)
  for (let i = 0; i < loopCount; i++) {
    let start = i * OTA_IMAGE_BLOCK_LENGTH
    let end = Math.min(arrayBuffer.byteLength, start + OTA_IMAGE_BLOCK_LENGTH)
    let arrayTemp = arrayBuffer.slice(start, end)
    const len = Util.intToAb(arrayTemp.byteLength, 1)
    array.push(Util.concatenate(cmdId, Util.intToAb(loopCount, 2), Util.intToAb(i, 2), len, arrayTemp))
  }
  return array
}

const Util = require('../../utils/util.js')
const MD5 = require('../../utils/MD5.js')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    bleDeviceId: '',
    rxFrameNum: 0,
    flowStatus: FS_CTS,
    blockSize: 0,
    txInterval: MAX_SEND_INTERVAL,
    rxLen: 0,
    rxCacheData: [],
    txCachePkg: [],
    txIndex: 0,
    bleTimer: 0,
    deviceId: '',
    wifiSsid: '16',
    wifiPwd: '88888888',
    lowTemp: -40,
    highTemp: 15,
    ipAddress: DEFAULT_IP,
    domain: DEFAULT_DOMAIN,
    otaPkgArray: [],
    otaPkgIndex: 0,
    otaProgress: 0
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
      this.analyzeData(buffer)
      this
    })
  },

  /**
   * 解析协议层
   * @param {*} buffer 
   */
  analyzeData(buffer) {
    const receive = new Uint8Array(buffer)
    const frameType = receive[0] >> 5
    var len
    switch (frameType) {
      case FRAME_SINGLE:
        len = receive[0] & 0x1F
        if (len <= MAX_SINGLE_LEN) {
          this.setData({
            rxLen: len,
            rxCacheData: receive.slice(1)
          })
          this.parseRxData()
        } else {
          this.setData({
            rxLen: 0,
            rxCacheData: []
          })
        }
        break
      case FRAME_FIRST:
        len = ((receive[0] & 0x1F) << 8) + (receive[1] & 0xFF)
        if (len >= MAX_SINGLE_LEN) {
          this.setData({
            rxLen: len,
            rxCacheData: receive.slice(2)
          })
          this.sendFCData()
          this.setBleTimer(200)
        } else {
          this.setData({
            rxLen: 0,
            rxCacheData: []
          })
        }
        break
      case FRAME_MULTI:
        clearTimeout(this.data.bleTimer)
        this.setBleTimer(1500)
        const frameNum = receive[0] & 0x1F
        if (frameNum < 0x1F) {
          if (this.data.rxFrameNum + 1 === frameNum) {
            this.setData({
              rxFrameNum: frameNum,
              rxCacheData: Util.concatenateArray(this.data.rxCacheData, receive.slice(1))
            })
            this.parseRxData()
          } else {
            // 包序异常
            this.setData({
              rxLen: 0,
              rxCacheData: [],
              rxFrameNum: 0
            })
          }
        } else if (frameNum === 0x1F) { // 包序号达到1F时，下一包包序从0开始
          if (this.data.rxFrameNum + 1 === frameNum) {
            this.setData({
              rxFrameNum: -1,
              rxCacheData: Util.concatenateArray(this.data.rxCacheData, receive.slice(1))
            })
            this.parseRxData()
          } else {
            this.setData({
              rxLen: 0,
              rxCacheData: [],
              rxFrameNum: 0
            })
          }
        }
        break
      case FRAME_CONTROL:
        clearTimeout(this.data.bleTimer)
        const flowStatus = receive[0] & 0x1F
        const blockSize = receive[1] & 0xFF
        this.setData({
          flowStatus: flowStatus,
          blockSize: blockSize
        })
        const separationTime = receive[2] & 0xFF
        if (separationTime >= 0x00 && separationTime <= 0x7F) {
          this.data.txInterval = separationTime * 10
        } else if (separationTime >= 0xF1 && separationTime <= 0xF9) {
          this.data.txInterval = separationTime & 0x0F
        } else {
          this.data.txInterval = MAX_SEND_INTERVAL
        }
        console.log('flowStatus = ' + flowStatus + ' blockSize = ' + blockSize + ' separationTime = ' + separationTime)
        this.checkFlowStatus()
        break
    }
  },

  /**
   * 发送流控数据
   */
  sendFCData() {
    const data = new Uint8Array(3)
    const flowStatus = FS_CTS
    data[0] = (FRAME_CONTROL << 5) + (flowStatus & 0x1F)
    data[1] = 0x00 // 最多接收包数， 0x00表示无限制
    data[2] = 0x01 // 发送间隔 10ms
    this.write(data.buffer)
  },

  /**
   * 解析数据层
   */
  parseRxData() {
    console.log('rxLen = ' + this.data.rxLen + ' cacheLen = ' + this.data.rxCacheData.length)
    if (this.data.rxLen == this.data.rxCacheData.length) {
      clearTimeout(this.data.bleTimer)
      const cmdId = this.data.rxCacheData[0] & 0xFF
      switch (cmdId) {
        case RTX_COMMON_RSP:
          const msgId = this.data.rxCacheData[1] & 0xFF
          const result = this.data.rxCacheData[2] & 0xFF
          switch (msgId) {
            case TX_SET_PARAM:
              if (result == COMMON_SUCCESS_CODE) {
                this.paramModal.hideModal()
                wx.showToast({
                  title: '参数设置成功',
                  icon: 'none'
                })
              } else {
                wx.showToast({
                  title: '参数设置失败，请重试',
                  icon: 'none'
                })
              }
              break
            case TX_REQ_OTA:
              if (result == COMMON_SUCCESS_CODE) {
                this.progressModal.showModal()
                this.setData({
                  otaProgress: 0
                })
                this.otaSend()
              } else {
                this.progressModal.hideModal()
                wx.showToast({
                  title: '请求升级失败，请重试',
                  icon: 'none'
                })
              }
              break
            default:
              break
          }
          break
        case RTX_READ_PARAM:
          var index = 1
          var paramId = 1
          var paramLen = 0
          var paramData = []
          while (index < this.data.rxCacheData.length) {
            paramId = this.data.rxCacheData[index]
            index++
            paramLen = this.data.rxCacheData[index]
            index++
            paramData = this.data.rxCacheData.slice(index, index + paramLen)
            index += paramLen
            switch (paramId) {
              case PARAM_ID_DEVICE_ID:
                if (paramData.length == 6) {
                  this.setData({
                    deviceId: Util.abToHex(paramData.buffer).slice(1)
                  })
                  console.log('deviceId = ' + this.data.deviceId)
                }
                break
              case PARAM_ID_WIFI_SSID:
                if (paramData.length == 19) {
                  this.setData({
                    wifiSsid: Util.ab2str(paramData.buffer).replace(/(\0*$)/g, "")
                  })
                }
                break
              case PARAM_ID_WIFI_PWD:
                if (paramData.length == 19) {
                  this.setData({
                    wifiPwd: Util.ab2str(paramData.buffer).replace(/(\0*$)/g, "")
                  })
                }
                break
              case PARAM_ID_WORK_TEMP:
                if (paramData.length == 4) {
                  const lowTemp = Util.bytesToFloat(paramData[0], paramData[1])
                  const highTemp = Util.bytesToFloat(paramData[2], paramData[3])
                  this.setData({
                    lowTemp: lowTemp,
                    highTemp: highTemp
                  })
                }
                break
              case PARAM_ID_IP:
                const ipAndDomain = Util.ab2str(paramData.buffer).replace(/(\0*$)/g, "")
                const array = ipAndDomain.split(";")
                console.log('ipAndDomain = '+ ipAndDomain)
                if (array != undefined) {
                  if (array[0].length != 0) {
                    this.setData({
                      ipAddress: array[0]
                    })
                  }
                  if (array[1].length != 0) {
                    this.setData({
                      domain: array[1]
                    })
                  }
                }
                break
              default:
                break
            }
          }
          this.paramModal.showModal()
          break
        case RTX_HISTORY_DATA:
          break
        case RTX_OTA_RAW:
          const status = this.data.rxCacheData[1] & 0x03
          switch (status) {
            case 0x00:
              this.setData({
                otaPkgIndex: this.data.otaPkgIndex + 1,
                otaProgress: Number(((this.data.otaPkgIndex / this.data.otaPkgArray.length) * 100).toFixed(1))
              })
              this.otaSend()
              break
            case 0x01:
              this.setData({
                otaPkgArray: [],
                otaPkgIndex: 0,
                otaProgress: 100
              })
              this.progressModal.hideModal()
              wx.showToast({
                title: '升级成功',
                icon: 'none'
              })
              break
            case 0x03:
              this.progressModal.hideModal()
              this.setData({
                otaPkgArray: [],
                otaPkgIndex: 0,
                otaProgress: 0
              })
              wx.showToast({
                title: '升级失败，请重试',
                icon: 'none'
              })
              break
            default:
              break
          }
          break
        default:
          break
      }
    }
  },

  buildSendPkg(data) {
    const len = data.byteLength
    console.log('len = ' + len)
    this.setBleTimer(1500)
    if (len <= MAX_SINGLE_LEN) {
      const frameHead = Util.intToAb((FRAME_SINGLE << 5) + (len & 0x1F), 1)
      this.write(Util.concatenate(frameHead, data))
    } else {
      this.slpitPkg(data.slice(18))
      const frameHead = Util.intToAb((FRAME_FIRST << 13) + (len & 0x1FFF), 2)
      this.write(Util.concatenate(frameHead, data.slice(0, 18)))
    }
  },

  /**
   * 除去首包后 连续帧分包
   * @param {*} data 
   */
  slpitPkg(data) {
    const len = data.byteLength
    console.log('after len = ' + len);
    var loopCount = parseInt(len / MAX_SINGLE_LEN) + parseInt(len %
      MAX_SINGLE_LEN === 0 ? 0 : 1)
    for (let i = 0; i < loopCount; i++) {
      let start = i * MAX_SINGLE_LEN
      let end = Math.min(len, start + MAX_SINGLE_LEN)
      var serial
      if (i + 1 <= 0x1F) {
        serial = i + 1
      } else {
        serial = ((i + 1) % (0x1F + 1)) & 0x1F
      }
      const head = Util.intToAb((FRAME_MULTI << 5) + serial, 1)
      let arrayTemp = Util.concatenate(head, data.slice(start, end))
      this.data.txCachePkg.push(arrayTemp)
    }
  },

  checkFlowStatus() {
    switch (this.data.flowStatus) {
      case FS_CTS:
        if (this.data.blockSize === 0x00) {
          this.sendContinuousFrame(this.data.txCachePkg.length)
        } else {
          this.sendContinuousFrame(this.data.txIndex + this.data.blockSize)
        }
        break
      case FS_WAIT:
        this.setBleTimer(200)
        break
      case FS_OVER_FLOW:
        this.setData({
          txCachePkg: [],
          txIndex: 0
        })
        break
    }
  },

  sendContinuousFrame(endIdx) {
    console.log('endIdx = ' + endIdx + ' size = ' + this.data.txCachePkg.length)
    for (var i = this.data.txIndex; i < endIdx; i++) {
      const pkgData = this.data.txCachePkg[i]
      this.write(pkgData)
      this.data.txIndex++
      sleep(this.data.txInterval)
    }
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

  setBleTimer(delayTime) {
    this.data.bleTimer = setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '蓝牙通信超时, 请重试',
        icon: 'none'
      })
    }, delayTime);
  },

  queryHistoryData() {
    this.modal.showModal()
  },

  configParam() {
    this.setData({
      rxLen: 0,
      rxCacheData: [],
      rxFrameNum: 0
    })
    const cmdId = Util.intToAb(RTX_READ_PARAM, 1)
    const paramId = new Uint8Array([PARAM_ID_DEVICE_ID, PARAM_ID_WIFI_SSID, PARAM_ID_WIFI_PWD, PARAM_ID_WORK_TEMP, PARAM_ID_IP])
    const data = Util.concatenate(cmdId, paramId.buffer)
    this.buildSendPkg(data)
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
      wx.showToast({
        title: '暂不支持',
        icon: 'none'
      })
    }).catch(() => {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['bin'],
        success(res) {
          that.requestUpgrade(res.tempFiles[0].path)
        },
        fail(res) {
          console.log(res)
        }
      })
    });
  },

  requestUpgrade(filePath) {
    const fs = wx.getFileSystemManager()
    var that = this
    fs.readFile({
      filePath: filePath,
      position: 0,
      success(res) {
        const buffer = res.data
        var array = new Uint8Array(buffer)
        const header = array.slice(BOOT_AGENT_LENGTH, BOOT_AGENT_LENGTH + 24)
        const projectId = Util.wordToInt(header[5], header[4])
        const chipId = Util.wordToInt(header[7], header[6])
        const fwId = Util.wordToInt(header[9], header[8])
        const imageSize = Util.fourBytesToInt(header[15], header[14], header[13], header[12])
        const checkSum = Util.fourBytesToInt(header[19], header[18], header[17], header[16])
        console.log("fwId = " + fwId + " imageSize = " + imageSize + " fileLen = " + array.length)
        if (imageSize != (array.length - BOOT_M0_LENGTH)) {
          wx.showToast({
            title: '升级文件已损坏，请重试',
            icon: 'none'
          })
        } else {
          const updateData = buffer.slice(BOOT_M0_LENGTH)
          let spark = new MD5.ArrayBuffer();
          spark.append(updateData);
          let md5 = spark.end(false);
          that.data.otaPkgArray = splitOtaFile(updateData)
          that.otaStart(projectId, chipId, fwId, imageSize, checkSum, md5)
        }
      },
      fail(res) {
        wx.showToast({
          title: '读取升级文件失败',
          icon: 'none'
        })
      }
    })
  },

  otaStart(projectId, chipId, fwId, imageSize, checkSum, md5) {
    const cmdId = Util.intToAb(TX_REQ_OTA, 1)
    const data = Util.concatenate(cmdId, Util.intToAb(projectId, 2), Util.intToAb(chipId, 2), Util.intToAb(fwId, 2),
      Util.intToAb(imageSize, 4), Util.intToAb(checkSum, 4), Util.hexStrToAB(md5))
    this.buildSendPkg(data)
  },

  otaSend() {
    this.buildSendPkg(this.data.otaPkgArray[this.data.otaPkgIndex])
  },

  _confirmEvent: function (e) {
    this.modal.hideModal()
    // wx.showLoading({
    //   title: '正在提取数据',
    // })
    const cmdId = Util.intToAb(RTX_HISTORY_DATA, 1)
    const start = Util.dateToAb(e.detail.startDate, e.detail.startTime)
    const end = Util.dateToAb(e.detail.endDate, e.detail.endTime)
    const data = Util.concatenate(cmdId, start, end)
    this.buildSendPkg(data)
  },

  _paramConfirmEvent: function (e) {
    const deviceId = Util.hexStrToAB('0' + e.detail.deviceId)
    const ssid = Util.str2ab(e.detail.wifiSsid)
    const pwd = Util.str2ab(e.detail.wifiPwd)
    const lowTemp = Util.signIntToBytes(e.detail.lowTemp * 10)
    const highTemp = Util.signIntToBytes(e.detail.highTemp * 10)
    const ipAndDoamin = Util.str2ab(e.detail.ipAddress + ';' + e.detail.domain)
    const data = Util.concatenate(Util.intToAb(TX_SET_PARAM, 1),
      Util.intToAb(PARAM_ID_DEVICE_ID, 1), Util.intToAb(0x06, 1), deviceId,
      Util.intToAb(PARAM_ID_WIFI_SSID, 1), Util.intToAb(ssid.byteLength, 1), ssid,
      Util.intToAb(PARAM_ID_WIFI_PWD, 1), Util.intToAb(pwd.byteLength, 1), pwd,
      Util.intToAb(PARAM_ID_WORK_TEMP, 1), Util.intToAb(0x04, 1), lowTemp, highTemp,
      Util.intToAb(PARAM_ID_IP, 1), Util.intToAb(ipAndDoamin.byteLength, 1), ipAndDoamin)
    this.buildSendPkg(data)
  },

  _cancelEvent: function () {
    console.log("点击取消!");
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    this.modal = this.selectComponent("#modal")
    this.paramModal = this.selectComponent("#param_modal")
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