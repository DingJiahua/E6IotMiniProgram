// index.js
// 获取应用实例
const app = getApp()

const SERVICE_UUID = "0000FFA0-0000-1000-8000-00805F9B34FB";

// ArrayBuffer转16进度字符串示例
function ab2hex(buffer) {
  const hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join('')
}

// ArrayBuffer转16进度字符串示例
function ab2hexWithSpace(buffer) {
  const hexArr = Array.prototype.map.call(
    new Uint8Array(buffer),
    function (bit) {
      return ('00' + bit.toString(16)).slice(-2)
    }
  )
  return hexArr.join(' ')
}

var hex2ab = function (hex) {
  var typedArray = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
    return parseInt(h, 16)
  }))

  var buffer = typedArray.buffer
  return buffer
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

function versionCompare(ver1, ver2) { //版本比较
  var version1pre = parseFloat(ver1)
  var version2pre = parseFloat(ver2)
  var version1next = parseInt(ver1.replace(version1pre + ".", ""))
  var version2next = parseInt(ver2.replace(version2pre + ".", ""))
  if (version1pre > version2pre)
    return true
  else if (version1pre < version2pre)
    return false
  else {
    if (version1next > version2next)
      return true
    else
      return false
  }
}

var Util = require('../../utils/util.js')

Page({
  data: {
    motto: '正在扫描设备',
    userInfo: {},
    hasUserInfo: false,
    // canIUse: wx.canIUse('button.open-type.getUserInfo'),
    // canIUseGetUserProfile: false,
    // canIUseOpenData: wx.canIUse('open-data.type.userAvatarUrl') && wx.canIUse('open-data.type.userNickName'), // 如需尝试获取用户信息可改为false
    status: 0,
    pkgSerial: 0,
    mulitPkg: false,
    receivePkg: new ArrayBuffer(),
    dataArray: [], //从安芯提取的808数据包数组
    dataIndex: 0, //当前正在上传平台的包序
    retryTimes: 0,
    timer: 0,
    bleTimer: 1
  },

  onReady: function () {
    this.modal = this.selectComponent("#modal")
  },

  // 事件处理函数
  bindViewTap() {
    wx.navigateTo({
      url: '../logs/logs'
    })
  },
  onLoad() {
    // if (wx.getUserProfile) {
    //   this.setData({
    //     canIUseGetUserProfile: true
    //   })
    // }
    if (app.getPlatform() == 'android' && versionCompare('6.5.7', app.getVersion())) {
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，请更新至最新版本',
        showCancel: false
      })
    } else if (app.getPlatform() == 'ios' && versionCompare('6.5.6', app.getVersion())) {
      wx.showModal({
        title: '提示',
        content: '当前微信版本过低，请更新至最新版本',
        showCancel: false
      })
    } else {
      var that = this
      wx.getSetting({
        success(res) {
          if (res.authSetting['scope.bluetooth']) {
            that.openBluetoothAdapter()
          } else {
            wx.authorize({
              scope: 'scope.bluetooth',
              success() {
                that.openBluetoothAdapter()
              },
              fail() {
                that.showBtPermissionModal()
              }
            })
          }
        }
      })
    }
  },

  showBtPermissionModal() {
    var that = this
    wx.showModal({
      title: '权限申请',
      content: '安芯小程序申请使用蓝牙',
      showCancel: true,
      success: res => {
        if (res.confirm) {
          wx.openSetting({
            success(res) {
              that.openBluetoothAdapter()
            },
            fail(res) {
              console.log(res)
            }
          })
        }
      }
    })
  },

  onUnload() {
    this.closeBluetoothAdapter()
    this.closeTcp()
  },
  openBluetoothAdapter() {
    var that = this
    wx.openBluetoothAdapter({
      success: (res) => {
        wx.showLoading({
          title: '正在扫描设备',
        })
        this.startBluetoothDevicesDiscovery()
      },
      fail: (res) => {
        if (res.errno == 103) {
          this.showBtPermissionModal()
        } else if (res.errCode == 10001) {
          wx.showModal({
            content: '未找到蓝牙设备, 请打开蓝牙后重试。',
            showCancel: false,
            title: '错误'
          })
          wx.onBluetoothAdapterStateChange((result) => {
            if (result && result.available) {
              wx.showLoading({
                title: '正在扫描设备',
              })
              this.startBluetoothDevicesDiscovery()
            }
          })
        }
      },
      complete() {
        wx.onBLEConnectionStateChange(function (res) {
          // 该方法回调中可以用于处理连接意外断开等异常情况
          if (!res.connected) {
            that.setData({
              motto: '正在扫描设备'
            })
            that.closeBluetoothAdapter()
            that.openBluetoothAdapter()
          }
        })
      }
    })
  },

  startBluetoothDevicesDiscovery() {
    if (this._discoveryStarted) {
      return
    }
    console.error('startBluetoothDevicesDiscovery')
    this._discoveryStarted = true
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: false,
      interval: 0,
      services: [SERVICE_UUID],
      success: (res) => {
        console.error(res)
        this.onBluetoothDeviceFound()
      },
      fail: (res) => {
        wx.hideLoading()
        wx.showToast({
          title: '扫描失败',
        })
      }
    })
  },
  onBluetoothDeviceFound() {
    wx.onBluetoothDeviceFound((result) => {
      this.stopBluetoothDevicesDiscovery()
      console.log('result = ' + result.devices[0].name)
      this.createBleConnection(result.devices[0])
    })
  },
  createBleConnection(device) {
    console.error("createBleConnection")
    wx.createBLEConnection({
      deviceId: device.deviceId,
      timeout: 15000,
      success: (res) => {
        wx.hideLoading()
        this.setData({
          motto: '当前连接：' + device.localName
        })
        wx.showToast({
          title: '连接成功',
        })
        this.getBLEDeviceServices(device.deviceId)
      },
      fail: (res) => {
        wx.hideLoading()
      },
    })
  },
  getBLEDeviceServices(deviceId) {
    wx.setBLEMTU({
      deviceId: deviceId,
      mtu: 247,
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
          }
        }
      },
      fail: (res) => {
        console.error('getBLEDeviceCharacteristics', res)
      }
    })
    wx.onBLECharacteristicValueChange((characteristic) => {
      console.log("receiver = " + ab2hex(characteristic.value))
      console.log("len = " + characteristic.value.byteLength)
      const buffer = characteristic.value
      const receive = new Uint8Array(buffer)
      if (this.data.mulitPkg) {
        clearTimeout(this.data.bleTimer)
        this.setData({
          receivePkg: Util.concatenate(this.data.receivePkg, buffer)
        })
        const multReceive = new Uint8Array(receivePkg)
        // 包长
        const len = Util.wordToInt(multReceive[3], multReceive[4])
        const status = multReceive[5]
        const pkgSerial = multReceive[6]
        if (status === 0x00) {
          this.data.timer = setTimeout(() => {
            wx.hideLoading()
            wx.showToast({
              title: '读取数据超时',
            })
          }, 10 * 1000);
          this.setData({
            status: status,
            pkgSerial: pkgSerial,
          })
          if (len === (receivePkg.byteLength - 6)) {
            const data = receivePkg.slice(1, receivePkg.byteLength - 1)
            //异或校验
            if (Util.getXORValue(data) === new Uint8Array(receivePkg)[receivePkg.byteLength - 1]) {
              this.data.dataArray.push(data.slice(6, data.byteLength))
              this.write(this.buildReplyBuffer(true))
            } else {
              this.write(this.buildReplyBuffer(false))
            }
          } else if (receivePkg.byteLength - 6 > len) {
            this.write(this.buildReplyBuffer(false))
          }
        } else if (status === 0x01) {
          console.log('数据接收完成')
          wx.showLoading({
            title: '正在上传数据',
          })
          this.setData({
            status: 0,
            pkgSerial: 0,
            mulitPkg: false
          })
          this.openTcp()
        }
      } else if (receive[0] === 0x24) {
        clearTimeout(this.data.bleTimer)
        if (receive[1] === 0x01 && receive[2] === 0x02) {
          // 包长
          const len = Util.wordToInt(receive[3], receive[4])
          const status = receive[5]
          const pkgSerial = receive[6]
          if (status === 0x00) {
            this.data.bleTimer = setTimeout(() => {
              wx.hideLoading()
              wx.showToast({
                title: '读取数据超时',
              })
            }, 10 * 1000);
            this.setData({
              status: status,
              pkgSerial: pkgSerial,
              mulitPkg: false
            })
            if (len === (buffer.byteLength - 6)) {
              this.data.mulitPkg = false
              const data = buffer.slice(1, buffer.byteLength - 1)
              //异或校验
              if (Util.getXORValue(data) === new Uint8Array(buffer)[buffer.byteLength - 1]) {
                this.data.dataArray.push(data.slice(6, data.byteLength))
                this.write(this.buildReplyBuffer(true))
              } else {
                this.write(this.buildReplyBuffer(false))
              }
            } else if (len > (buffer.byteLength - 6)) {
              this.setData({
                mulitPkg: true,
                receivePkg: buffer
              })
            }
          } else if (status === 0x01) {
            console.log('数据接收完成')
            wx.showLoading({
              title: '正在上传数据',
            })
            this.setData({
              status: 0,
              pkgSerial: 0,
              mulitPkg: false
            })
            this.openTcp()
          }
        }
      }
    })
  },

  buildReplyBuffer(success) {
    const buffer = new ArrayBuffer(7)
    const dataView = new DataView(buffer)
    dataView.setUint8(0, 0x24)
    dataView.setUint8(1, 0x01)
    dataView.setUint8(2, 0x03)
    dataView.setUint8(3, 0x00)
    dataView.setUint8(4, 0x02)
    if (success) {
      dataView.setUint8(5, 0x00)
    } else {
      dataView.setUint8(5, 0x01)
    }
    dataView.setUint8(6, this.data.pkgSerial)
    const bcc = new ArrayBuffer(1)
    const bccData = new DataView(bcc)
    bccData.setUint8(0, Util.getXORValue(buffer.slice(1, buffer.byteLength)))
    return Util.concatenate(buffer, bcc)
  },

  stopBluetoothDevicesDiscovery() {
    wx.stopBluetoothDevicesDiscovery({
      complete: () => {
        this._discoveryStarted = false
      }
    })
  },

  closeBluetoothAdapter() {
    wx.closeBluetoothAdapter()
    this._discoveryStarted = false
  },

  readData() {
    this.modal.showModal()
  },

  _onShowModal: function (e) {
    this.modal.showModal();
  },

  /**
   * [1] 包头0x24
   * [2] 消息id 0x01根据时间读取数据
   * [3] 子消息id 0x01
   * [4-5] 数据位包长
   * [n] 数据位(状态+开始时间+结束时间)
   * [最后一个字节] 异或校验
   * 2401010d01150a1a020000150a1a0d0a0009
   * @param {*} e 
   */
  _confirmEvent: function (e) {
    this.modal.hideModal()
    wx.showLoading({
      title: '正在提取数据',
    })
    const bufferHead = new ArrayBuffer(1)
    var dataView = new DataView(bufferHead)
    dataView.setUint8(0, 0x24)
    const bufferId = new ArrayBuffer(5)
    dataView = new DataView(bufferId)
    dataView.setUint8(0, 0x01)
    dataView.setUint8(1, 0x01)
    dataView.setUint8(2, 0x00)
    dataView.setUint8(3, 0x0D)
    dataView.setUint8(4, 0x01)
    const start = Util.dateToAb(e.detail.startDate, e.detail.startTime)
    const end = Util.dateToAb(e.detail.endDate, e.detail.endTime)
    const checkCode = new ArrayBuffer(1)
    var dataView = new DataView(checkCode)
    dataView.setUint8(0, Util.getXORValue(Util.concatenate(bufferId, start, end)))
    const buffer = Util.concatenate(bufferHead, bufferId, start, end, checkCode)
    this.write(buffer)
    this.data.bleTimer = setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '读取数据超时',
      })
    }, 10 * 1000);
  },

  write(buffer) {
    console.log('write = ' + ab2hex(buffer))
    wx.writeBLECharacteristicValue({
      characteristicId: this._characteristicId,
      deviceId: this._deviceId,
      serviceId: this._serviceId,
      value: buffer
    })
  },

  _cancelEvent: function () {
    console.log("点击取消!");
  },

  openTcp() {
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
      address: 'ejt.tptri.cn',
      port: 30058
    })
    tcp.onMessage(function (res) {
      clearTimeout(that.data.timer)
      console.log('msg = ' + ab2hex(res.message))
      const data = res.message.slice(1, res.message.byteLength - 2)
      const hexStr = ab2hexWithSpace(data);
      const realData = hex2ab(hexStr.replace(/ 7d 02/g, ' 7e').replace(/ 7d 01/g, ' 7d').replace(/ /g, ''))
      const checkCode = new Uint8Array(res.message)[res.message.byteLength - 2]
      const sumCode = Util.getXORValue(realData)
      const realDataNum = new Uint8Array(realData)
      const msgId = Util.wordToInt(realDataNum[0], realDataNum[1])
      const result = realDataNum[realData.byteLength - 1]
      if (checkCode === sumCode && msgId === 0x8001 && result === 0x00) {
        that.data.dataIndex++
        that.data.retryTimes = 0
        that.uploadData()
      } else {
        if (that.data.retryTimes >= 2) {
          that.data.dataIndex++
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

  closeTcp() {
    if (null != this._tcp) {
      this._tcp.close()
    }
  },

  uploadData() {
    console.log('index = ' + this.data.dataIndex + ' size = ' + this.data.dataArray.length)
    if (this.data.dataIndex >= this.data.dataArray.length) {
      this.setData({
        dataIndex: 0,
        dataArray: []
      })
      wx.hideLoading()
      wx.showToast({
        title: '上传完毕',
      })
      return
    }
    const data = this.data.dataArray[this.data.dataIndex]
    console.log('tcp data = ' + ab2hex(data))
    var that = this
    this.data.timer = setTimeout(function () {
      if (that.data.retryTimes >= 2) {
        that.data.dataIndex++
        that.data.retryTimes = 0
      } else {
        that.data.retryTimes++
      }
      that.uploadData()
    }, 10 * 1000)
    this._tcp.write(data)
  },

  // getUserProfile(e) {
  //   // 推荐使用wx.getUserProfile获取用户信息，开发者每次通过该接口获取用户个人信息均需用户确认，开发者妥善保管用户快速填写的头像昵称，避免重复弹窗
  //   wx.getUserProfile({
  //     desc: '展示用户信息', // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
  //     success: (res) => {
  //       console.log(res)
  //       this.setData({
  //         userInfo: res.userInfo,
  //         hasUserInfo: true
  //       })
  //     }
  //   })
  // },
  // getUserInfo(e) {
  //   // 不推荐使用getUserInfo获取用户信息，预计自2021年4月13日起，getUserInfo将不再弹出弹窗，并直接返回匿名的用户个人信息
  //   console.log(e)
  //   this.setData({
  //     userInfo: e.detail.userInfo,
  //     hasUserInfo: true
  //   })
  // }
})